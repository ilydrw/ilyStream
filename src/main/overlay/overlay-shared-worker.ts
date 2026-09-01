/**
 * One same-origin worker owns the physical WebSocket and multiplexes logical
 * EventSource subscriptions from every compatible browser-source page.
 */
export const OVERLAY_SHARED_WORKER_SCRIPT = `
(function(){
  var socket = null;
  var reconnectTimer = null;
  var reconnectDelay = 250;
  var subscriptions = Object.create(null);

  function socketUrl(){
    var url = new URL('/overlay/ws', self.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('cap', new URL(self.location.href).searchParams.get('cap') || '');
    return url.href;
  }

  function post(port, message){
    try { port.postMessage(message); } catch (err) {}
  }

  function send(message){
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch (err) { return false; }
  }

  function sendSubscription(subscription){
    send({
      type: 'subscribe',
      subscriptionId: subscription.id,
      channel: subscription.channel,
      after: subscription.after || 0,
      sinceAt: subscription.sinceAt || 0,
      limit: 120
    });
  }

  function hasSubscriptions(){
    for (var id in subscriptions) {
      if (Object.prototype.hasOwnProperty.call(subscriptions, id)) return true;
    }
    return false;
  }

  function scheduleReconnect(){
    if (reconnectTimer || !hasSubscriptions()) return;
    reconnectTimer = setTimeout(function(){
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(5000, reconnectDelay * 2);
  }

  function connect(){
    if (!hasSubscriptions()) return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    try { socket = new WebSocket(socketUrl()); }
    catch (err) { scheduleReconnect(); return; }
    socket.onopen = function(){
      reconnectDelay = 250;
      for (var id in subscriptions) {
        if (Object.prototype.hasOwnProperty.call(subscriptions, id)) sendSubscription(subscriptions[id]);
      }
    };
    socket.onmessage = function(event){
      var message = null;
      try { message = JSON.parse(event.data); } catch (err) { return; }
      if (!message || typeof message !== 'object') return;
      if (message.subscriptionId && subscriptions[message.subscriptionId]) {
        var targeted = subscriptions[message.subscriptionId];
        if (message.type === 'subscribed') {
          post(targeted.port, {
            type: 'open',
            subscriptionId: targeted.id,
            channel: targeted.channel,
            generation: message.generation,
            reset: Boolean(message.reset)
          });
        } else if (message.type === 'event') {
          if (Number(message.id) > 0) targeted.after = Math.max(targeted.after || 0, Number(message.id));
          post(targeted.port, message);
        }
        return;
      }
      if (message.type !== 'event' || !message.channel) return;
      for (var id in subscriptions) {
        if (!Object.prototype.hasOwnProperty.call(subscriptions, id)) continue;
        var subscription = subscriptions[id];
        if (subscription.channel !== message.channel) continue;
        if (Number(message.id) > 0) subscription.after = Math.max(subscription.after || 0, Number(message.id));
        post(subscription.port, message);
      }
    };
    socket.onclose = function(){
      socket = null;
      for (var id in subscriptions) {
        if (Object.prototype.hasOwnProperty.call(subscriptions, id)) {
          post(subscriptions[id].port, { type: 'reconnecting', subscriptionId: id });
        }
      }
      scheduleReconnect();
    };
    socket.onerror = function(){};
  }

  self.onconnect = function(event){
    var port = event.ports && event.ports[0];
    if (!port) return;
    port.onmessage = function(messageEvent){
      var message = messageEvent && messageEvent.data;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'receipt') {
        send(message);
        return;
      }
      var id = String(message.subscriptionId || '');
      if (!id) return;
      if (message.type === 'unsubscribe') {
        delete subscriptions[id];
        send({ type: 'unsubscribe', subscriptionId: id });
        return;
      }
      if (message.type !== 'subscribe') return;
      subscriptions[id] = {
        id: id,
        port: port,
        channel: String(message.channel || ''),
        after: Number(message.after) || 0,
        sinceAt: Number(message.sinceAt) || Date.now()
      };
      if (!sendSubscription(subscriptions[id])) connect();
    };
    port.start();
  };
})();
`
