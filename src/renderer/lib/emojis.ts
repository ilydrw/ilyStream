export interface EmojiCategory {
  id: string
  label: string
  icon: string
  emojis: string[]
}

interface EmojiSource {
  category: string
  codepoints: string[]
  label: string
  keywords: string[]
}

interface EmojiRecord {
  symbol: string
  category: string
  label: string
  keywords: string[]
  tokens: Set<string>
  labelTokens: Set<string>
}

const u = (...codepoints: string[]) =>
  String.fromCodePoint(...codepoints.map((codepoint) => Number.parseInt(codepoint, 16)))

const CATEGORY_DEFINITIONS = [
  { id: 'smileys', label: 'Smileys', icon: u('1f600') },
  { id: 'gestures', label: 'Gestures', icon: u('1f44b') },
  { id: 'people', label: 'People', icon: u('1f464') },
  { id: 'animals', label: 'Animals', icon: u('1f436') },
  { id: 'food', label: 'Food', icon: u('1f355') },
  { id: 'activities', label: 'Activities', icon: u('1f3ae') },
  { id: 'objects', label: 'Objects', icon: u('1f514') },
  { id: 'symbols', label: 'Symbols', icon: u('2764', 'fe0f') }
] as const

const EMOJI_SOURCES: EmojiSource[] = [
  e('smileys', '1f600', 'grinning face', 'smile happy grin emoji face'),
  e('smileys', '1f603', 'big smile', 'smile happy excited face'),
  e('smileys', '1f604', 'laughing smile', 'laugh happy grin face'),
  e('smileys', '1f601', 'beaming smile', 'smile happy teeth'),
  e('smileys', '1f606', 'laughing squint', 'laugh lol funny haha'),
  e('smileys', '1f923', 'rolling laughing', 'rofl lol funny haha lmao'),
  e('smileys', '1f602', 'joy tears', 'cry laugh funny lol'),
  e('smileys', '1f642', 'slight smile', 'smile happy calm'),
  e('smileys', '1f609', 'wink', 'wink joke playful'),
  e('smileys', '1f60d', 'heart eyes', 'love heart crush cute'),
  e('smileys', '1f970', 'smiling hearts', 'love heart cute happy'),
  e('smileys', '1f618', 'kiss face', 'kiss love smooch'),
  e('smileys', '1f60e', 'cool face', 'cool sunglasses shades'),
  e('smileys', '1f914', 'thinking face', 'think hmm question'),
  e('smileys', '1f928', 'raised eyebrow', 'suspicious doubt hmm'),
  e('smileys', '1f62d', 'sob crying', 'cry sad tears'),
  e('smileys', '1f631', 'screaming face', 'scream scared shocked'),
  e('smileys', '1f621', 'angry face', 'angry mad rage'),
  e('smileys', '1f92f', 'mind blown', 'wow shocked crazy'),
  e('smileys', '1f973', 'party face', 'party celebrate hype'),
  e('smileys', '1f480', 'skull', 'dead skeleton rip'),
  e('smileys', '1f47b', 'ghost', 'spooky halloween scare'),
  e('smileys', '1f47d', 'alien', 'alien ufo space'),
  e('smileys', '1f916', 'robot', 'robot ai tech'),
  e('smileys', '1f921', 'clown', 'clown joke funny'),
  ...bulk('smileys', [
    '1f605', '1f607', '1f60a', '1f60b', '1f60c', '1f60f', '1f612', '1f613',
    '1f614', '1f615', '1f616', '1f617', '1f619', '1f61a', '1f61b', '1f61c',
    '1f61d', '1f61e', '1f61f', '1f620', '1f622', '1f623', '1f624', '1f625',
    '1f626', '1f627', '1f628', '1f629', '1f62a', '1f62b', '1f62c', '1f62e',
    '1f62f', '1f630', '1f632', '1f633', '1f634', '1f635', '1f636', '1f637',
    '1f641', '1f643', '1f644', '1f910', '1f911', '1f912', '1f913', '1f915',
    '1f917', '1f920', '1f922', '1f924', '1f925', '1f927', '1f929', '1f92a',
    '1f92b', '1f92c', '1f92d', '1f92e', '1f930', '1f970', '1f971', '1f972',
    '1f974', '1f975', '1f976', '1f97a', '1f978', '1f9d0', '1fae0', '1fae1',
    '1fae2', '1fae3', '1fae4', '1fae5', '1fae8', '1f608', '1f47f', '1f479',
    '1f47a', '1f4a9'
  ], 'face emoji', 'smile face emotion reaction expression'),

  e('gestures', '1f44b', 'waving hand', 'wave hi hello bye'),
  e('gestures', '1f44d', 'thumbs up', 'yes ok good like approve'),
  e('gestures', '1f44e', 'thumbs down', 'no bad dislike'),
  e('gestures', '1f44f', 'clapping hands', 'clap applause bravo'),
  e('gestures', '1f64c', 'raised hands', 'hype celebrate praise'),
  e('gestures', '1f64f', 'folded hands', 'pray thanks please'),
  e('gestures', '1f4aa', 'flexed biceps', 'strong flex muscle'),
  e('gestures', '1f91d', 'handshake', 'deal agreement thanks'),
  e('gestures', '270c', 'victory hand', 'peace win victory'),
  e('gestures', '1f91f', 'love you gesture', 'love heart hand'),
  e('gestures', '1f595', 'middle finger', 'rude flip bird'),
  e('gestures', '1f91c', 'right fist', 'punch fist bump'),
  ...bulk('gestures', [
    '1f44c', '1f448', '1f449', '1f446', '1f447', '261d', '270b', '1f91a',
    '1f590', '1f596', '1faf1', '1faf2', '1faf3', '1faf4', '1faf5', '1faf6',
    '1f90c', '1f90f', '1f918', '1f919', '1f91b', '1f91e', '1f932', '1f933',
    '1f485', '1f4aa', '1f9be', '1f9bf', '1f9b5', '1f9b6', '1f442', '1f443',
    '1f9e0', '1fac0', '1fac1', '1fac2', '1f440', '1f441', '1f445', '1f444'
  ], 'gesture emoji', 'gesture hand body reaction person'),

  e('people', '1f464', 'user silhouette', 'user person viewer follower account'),
  e('people', '1f465', 'users silhouette', 'users people audience viewers'),
  e('people', '1f9d1', 'person', 'person user viewer'),
  e('people', '1f9d1', 'fe0f', '200d', '1f3a4', 'singer', 'sing karaoke performer'),
  e('people', '1f9d1', 'fe0f', '200d', '1f4bb', 'technologist', 'computer tech coder'),
  e('people', '1f9d9', 'mage', 'magic wizard fantasy'),
  e('people', '1f977', 'ninja', 'ninja stealth'),
  e('people', '1f934', 'prince', 'royal king crown'),
  e('people', '1f478', 'princess', 'royal queen crown'),
  e('people', '1f385', 'santa', 'christmas holiday'),
  ...bulk('people', [
    '1f476', '1f9d2', '1f466', '1f467', '1f468', '1f469', '1f9d4', '1f474',
    '1f475', '1f472', '1f473', '1f46e', '1f477', '1f482', '1f575', '1f469 200d 2695 fe0f',
    '1f468 200d 2695 fe0f', '1f469 200d 1f393', '1f468 200d 1f393', '1f469 200d 1f3a4',
    '1f468 200d 1f3a4', '1f469 200d 1f4bb', '1f468 200d 1f4bb', '1f469 200d 1f527',
    '1f468 200d 1f527', '1f469 200d 1f680', '1f468 200d 1f680', '1f470', '1f935',
    '1f936', '1f9b8', '1f9b9', '1f9df', '1f9de', '1f9dc', '1f9da', '1f9db',
    '1f483', '1f57a', '1f46f', '1f9d6', '1f9d7', '1f9d8', '1f6c0', '1f6cc',
    '1f9d1 200d 1f91d 200d 1f9d1', '1f46d', '1f46b', '1f46c', '1f46a', '1f48f', '1f491'
  ], 'people emoji', 'person people user viewer follower audience role'),

  e('animals', '1f436', 'dog face', 'dog puppy pet'),
  e('animals', '1f431', 'cat face', 'cat kitten pet'),
  e('animals', '1f42d', 'mouse face', 'mouse rat animal'),
  e('animals', '1f439', 'hamster face', 'hamster pet'),
  e('animals', '1f430', 'rabbit face', 'rabbit bunny'),
  e('animals', '1f98a', 'fox', 'fox animal'),
  e('animals', '1f43b', 'bear', 'bear animal'),
  e('animals', '1f43c', 'panda', 'panda bear'),
  e('animals', '1f981', 'lion', 'lion king animal'),
  e('animals', '1f438', 'frog', 'frog animal'),
  e('animals', '1f435', 'monkey', 'monkey animal'),
  e('animals', '1f414', 'chicken', 'chicken bird'),
  e('animals', '1f427', 'penguin', 'penguin bird'),
  e('animals', '1f984', 'unicorn', 'unicorn magic'),
  e('animals', '1f41d', 'bee', 'bee bug buzz'),
  e('animals', '1f98b', 'butterfly', 'butterfly bug'),
  e('animals', '1f422', 'turtle', 'turtle reptile'),
  e('animals', '1f40d', 'snake', 'snake reptile'),
  e('animals', '1f419', 'octopus', 'octopus sea'),
  e('animals', '1f988', 'shark', 'shark sea'),
  e('animals', '1f42c', 'dolphin', 'dolphin sea'),
  ...bulk('animals', [
    '1f412', '1f98d', '1f9a7', '1f415', '1f9ae', '1f415 200d 1f9ba', '1f429', '1f43a',
    '1f408', '1f408 200d 2b1b', '1f981', '1f42f', '1f405', '1f406', '1f434', '1face',
    '1facf', '1f40e', '1f984', '1f993', '1f98c', '1f9ac', '1f42e', '1f402', '1f403',
    '1f404', '1f437', '1f416', '1f417', '1f43d', '1f40f', '1f411', '1f410', '1f42a',
    '1f42b', '1f999', '1f992', '1f418', '1f9a3', '1f98f', '1f99b', '1f401', '1f400',
    '1f407', '1f43f', '1f9ab', '1f994', '1f987', '1f43e', '1f983', '1f413', '1f423',
    '1f424', '1f425', '1f426', '1f426 200d 2b1b', '1fabf', '1f985', '1f986', '1f9a2',
    '1f989', '1f9a4', '1fab6', '1f9a9', '1f99a', '1f99c', '1f438', '1f40a', '1f422',
    '1f98e', '1f996', '1f995', '1f433', '1f40b', '1f42c', '1f9ad', '1f41f', '1f420',
    '1f421', '1f990', '1f99e', '1f980', '1f991', '1f9aa', '1f98b', '1f41b', '1f41c',
    '1fab2', '1fab3', '1fab0', '1fab1', '1f997', '1f577', '1f578', '1f982', '1f99f',
    '1f9a0', '1f490', '1f338', '1f4ae', '1fab7', '1f339', '1f940', '1f33a', '1f33b',
    '1f33c', '1f337', '1f331', '1fab4', '1f332', '1f333', '1f334', '1f335', '1f33e',
    '1f33f', '2618', '1f340', '1f341', '1f342', '1f343', '1fab9', '1fab5'
  ], 'animal nature emoji', 'animal nature plant flower pet bug sea'),

  e('food', '1f34e', 'red apple', 'apple fruit red'),
  e('food', '1f34c', 'banana', 'banana fruit'),
  e('food', '1f349', 'watermelon', 'watermelon fruit'),
  e('food', '1f353', 'strawberry', 'strawberry fruit'),
  e('food', '1f352', 'cherries', 'cherry cherries fruit'),
  e('food', '1f351', 'peach', 'peach fruit'),
  e('food', '1f34d', 'pineapple', 'pineapple fruit'),
  e('food', '1f951', 'avocado', 'avocado food'),
  e('food', '1f955', 'carrot', 'carrot food'),
  e('food', '1f354', 'burger', 'hamburger food'),
  e('food', '1f35f', 'fries', 'fries food'),
  e('food', '1f355', 'pizza', 'pizza food'),
  e('food', '1f32e', 'taco', 'taco food'),
  e('food', '1f363', 'sushi', 'sushi food'),
  e('food', '1f369', 'donut', 'donut sweet'),
  e('food', '1f370', 'cake', 'cake sweet birthday'),
  e('food', '1f36a', 'cookie', 'cookie sweet'),
  e('food', '1f37f', 'popcorn', 'popcorn movie'),
  e('food', '2615', 'coffee', 'coffee drink caffeine'),
  e('food', '1f37a', 'beer', 'beer drink cheers'),
  ...bulk('food', [
    '1f34f', '1f350', '1f34a', '1f34b', '1f34b 200d 1f7e9', '1f347', '1fad0', '1fad2',
    '1f96d', '1fad0', '1f345', '1fad2', '1f965', '1f346', '1f954', '1f33d', '1f336',
    '1fad1', '1f952', '1f96c', '1f966', '1f9c4', '1f9c5', '1fad8', '1f95c', '1fad8',
    '1f330', '1fada', '1f35e', '1f950', '1f956', '1fad3', '1f968', '1f96f', '1f95e',
    '1f9c7', '1f9c0', '1f356', '1f357', '1f969', '1f953', '1f32d', '1f96a', '1f32f',
    '1f959', '1fad4', '1f95a', '1f373', '1f958', '1f372', '1fad5', '1f963', '1f957',
    '1f37f', '1f9c8', '1f9c2', '1f96b', '1f371', '1f358', '1f359', '1f35a', '1f35b',
    '1f35c', '1f35d', '1f360', '1f362', '1f361', '1f364', '1f365', '1f96e', '1f361',
    '1f95f', '1f960', '1f961', '1f980', '1f99e', '1f990', '1f366', '1f367', '1f368',
    '1f36b', '1f36c', '1f36d', '1f36e', '1f36f', '1f95b', '1f37c', '1fad6', '1f375',
    '1fad6', '1f376', '1f37e', '1f377', '1f378', '1f379', '1f37b', '1f942', '1f943',
    '1fad7', '1f964', '1f9cb', '1f9c3', '1f9c9', '1f9ca', '1f962', '1f37d', '1f374',
    '1f944', '1f52a', '1fad9'
  ], 'food drink emoji', 'food drink fruit meal snack dessert'),

  e('activities', '1f3ae', 'video game', 'game controller gaming'),
  e('activities', '1f3b2', 'dice', 'dice game random'),
  e('activities', '1f3af', 'bullseye', 'target goal aim'),
  e('activities', '1f3c6', 'trophy', 'trophy win winner'),
  e('activities', '1f947', 'gold medal', 'medal gold win'),
  e('activities', '26bd', 'soccer ball', 'soccer football sport'),
  e('activities', '1f3c0', 'basketball', 'basketball ball sport'),
  e('activities', '1f3c8', 'football', 'football ball sport'),
  e('activities', '26be', 'baseball', 'baseball ball sport'),
  e('activities', '1f3be', 'tennis', 'tennis ball sport'),
  e('activities', '1f3a8', 'artist palette', 'art paint creative'),
  e('activities', '1f3ac', 'clapper board', 'movie film video'),
  e('activities', '1f3a4', 'microphone', 'mic microphone sing karaoke'),
  e('activities', '1f3a7', 'headphones', 'music headphones audio sound'),
  e('activities', '1f3b5', 'music note', 'music song note sound'),
  e('activities', '1f3b8', 'guitar', 'guitar music'),
  ...bulk('activities', [
    '1f3b9', '1f3ba', '1f3bb', '1fa95', '1f941', '1fa98', '1fa87', '1fa88', '1f3ad',
    '1f5bc', '1f3aa', '1f939', '1f3ab', '1f396', '1f3c5', '1f948', '1f949', '1f3c1',
    '1f3f4', '1f3f3', '1f3f3 fe0f 200d 1f308', '1f3f3 fe0f 200d 26a7 fe0f', '1f3f4 200d 2620 fe0f',
    '1f94e', '1f3d0', '1f3c9', '1f94f', '1f3b3', '1f3cf', '1f3d1', '1f3d2', '1f94d',
    '1f3d3', '1f94a', '1f94b', '1f945', '26f3', '26f8', '1f3a3', '1f93f', '1f3bd',
    '1f3bf', '1f6f7', '1f94c', '1f3af', '1fa80', '1fa81', '1f52e', '1fa84', '1f9ff',
    '1f9e9', '1f9f8', '1fa85', '1fa86', '2660', '2665', '2666', '2663', '265f', '1f0cf',
    '1f004', '1f3b4'
  ], 'activity emoji', 'activity sport game music party entertainment'),

  e('objects', '1f514', 'bell', 'bell alert notification sound'),
  e('objects', '1f4e3', 'megaphone', 'announce alert shout'),
  e('objects', '1f50a', 'speaker high volume', 'speaker sound volume audio'),
  e('objects', '1f4e2', 'loudspeaker', 'speaker sound alert'),
  e('objects', '1f381', 'gift', 'gift present donation alert'),
  e('objects', '1f4b0', 'money bag', 'money cash donate gift'),
  e('objects', '1f4b5', 'dollar', 'money cash dollar'),
  e('objects', '1f48e', 'diamond', 'diamond gem gift'),
  e('objects', '1f451', 'crown', 'crown royal subscriber sub vip'),
  e('objects', '1f4f1', 'mobile phone', 'phone mobile'),
  e('objects', '1f4bb', 'laptop', 'computer laptop pc'),
  e('objects', '2328', 'keyboard', 'keyboard typing'),
  e('objects', '1f4f7', 'camera', 'camera photo image'),
  e('objects', '1f4fa', 'television', 'tv screen stream'),
  e('objects', '1f4a1', 'light bulb', 'idea light'),
  e('objects', '1f525', 'fire', 'fire hot lit hype'),
  e('objects', '26a1', 'lightning bolt', 'lightning energy bolt'),
  e('objects', '1f4a3', 'bomb', 'bomb explode hype'),
  e('objects', '1f9f0', 'toolbox', 'tools settings setup'),
  e('objects', '1f527', 'wrench', 'wrench tool fix'),
  ...bulk('objects', [
    '1f48d', '1f484', '1f48b', '1f463', '1fa78', '1fa79', '1fa7a', '1f453', '1f576',
    '1f97d', '1f97c', '1f9ba', '1f454', '1f455', '1f456', '1f9e3', '1f9e4', '1f9e5',
    '1f9e6', '1f457', '1f458', '1f97b', '1fa71', '1fa72', '1fa73', '1f459', '1f45a',
    '1f45b', '1f45c', '1f45d', '1f6cd', '1f392', '1fa74', '1f45e', '1f45f', '1f97e',
    '1f97f', '1f460', '1f461', '1fa70', '1f462', '1f451', '1f452', '1f3a9', '1f393',
    '1f9e2', '1fa96', '26d1', '1f4ff', '1f4bd', '1f4be', '1f4bf', '1f4c0', '1f9ee',
    '1f3a5', '1f4f9', '1f4fc', '1f50d', '1f50e', '1f56f', '1fa94', '1f3ee', '1fa99',
    '1f4b3', '1faaa', '1f9fe', '1f4e7', '1f4e8', '1f4e9', '1f4e4', '1f4e5', '1f4e6',
    '1f4eb', '1f4ec', '1f4ed', '1f4ee', '1f5f3', '270f', '2712', '1f58b', '1f58a',
    '1f58c', '1f58d', '1f4dd', '1f4bc', '1f4c1', '1f4c2', '1f5c2', '1f4c5', '1f4c6',
    '1f5d2', '1f5d3', '1f4c7', '1f4c8', '1f4c9', '1f4ca', '1f4cb', '1f4cc', '1f4cd',
    '1f4ce', '1f587', '1f4cf', '1f4d0', '2702', '1f5c3', '1f5c4', '1f5d1', '1f512',
    '1f513', '1f50f', '1f510', '1f511', '1fa93', '1fa9a', '1f528', '2692', '1f6e0',
    '26cf', '2699', '1f9f1', '26d3', '1faa8', '1fab5', '1f9f2', '1f52b', '1f4a7',
    '1f52c', '1f52d', '1f4e1', '1f489', '1fa78', '1fa79', '1fa7a', '1f48a', '1fa9c',
    '1fa9d', '1f9ec', '1f9eb', '1f9ea', '1f321', '1f9f9', '1faa0', '1f9fa', '1f9fb',
    '1faa3', '1f9fc', '1faa5', '1f9fd', '1faa4', '1f6d2'
  ], 'object emoji', 'object tool item alert sound media'),

  e('symbols', '2764', 'fe0f', 'red heart', 'heart love red'),
  e('symbols', '1f9e1', 'orange heart', 'heart love orange'),
  e('symbols', '1f49b', 'yellow heart', 'heart love yellow'),
  e('symbols', '1f49a', 'green heart', 'heart love green'),
  e('symbols', '1f499', 'blue heart', 'heart love blue'),
  e('symbols', '1f49c', 'purple heart', 'heart love purple'),
  e('symbols', '1f5a4', 'black heart', 'heart love black'),
  e('symbols', '1f90d', 'white heart', 'heart love white'),
  e('symbols', '1f494', 'broken heart', 'heart broken sad'),
  e('symbols', '2728', 'sparkles', 'sparkles magic shiny'),
  e('symbols', '2b50', 'star', 'star favorite'),
  e('symbols', '1f4af', 'hundred points', 'hundred 100 perfect points'),
  e('symbols', '2705', 'check mark', 'check yes ok enabled'),
  e('symbols', '274c', 'cross mark', 'cross no disabled'),
  e('symbols', '26a0', 'warning', 'warning alert error'),
  e('symbols', '1f6ab', 'prohibited', 'blocked banned no'),
  e('symbols', '267b', 'recycle', 'repeat loop refresh'),
  e('symbols', '1f51e', 'no one under eighteen', 'adult 18 mature'),
  e('symbols', '1f3b6', 'musical notes', 'music notes song sound'),
  e('symbols', '1f195', 'new button', 'new fresh'),
  ...bulk('symbols', [
    '1f495', '1f496', '1f497', '1f498', '1f499', '1f49a', '1f49b', '1f49c', '1f49d',
    '1f49e', '1f49f', '2763', '1f4a2', '1f4a5', '1f4ab', '1f4a6', '1f4a8', '1f573',
    '1f4ac', '1f441 fe0f 200d 1f5e8 fe0f', '1f5e8', '1f5ef', '1f4ad', '1f4a4',
    '2648', '2649', '264a', '264b', '264c', '264d', '264e', '264f', '2650', '2651',
    '2652', '2653', '26ce', '1f500', '1f501', '1f502', '25b6', '23e9', '23ed', '23ef',
    '25c0', '23ea', '23ee', '1f53c', '23eb', '1f53d', '23ec', '23f8', '23f9', '23fa',
    '23cf', '1f3a6', '1f505', '1f506', '1f4f6', '1f6dc', '1f4f3', '1f4f4', '2640',
    '2642', '26a7', '2716', '2795', '2796', '2797', '1f7f0', '267e', '203c', '2049',
    '2753', '2754', '2755', '2757', '3030', '27b0', '27bf', '303d', '2733', '2734',
    '2747', '00a9', '00ae', '2122', '0023 fe0f 20e3', '002a fe0f 20e3', '0030 fe0f 20e3',
    '0031 fe0f 20e3', '0032 fe0f 20e3', '0033 fe0f 20e3', '0034 fe0f 20e3',
    '0035 fe0f 20e3', '0036 fe0f 20e3', '0037 fe0f 20e3', '0038 fe0f 20e3',
    '0039 fe0f 20e3', '1f51f', '1f520', '1f521', '1f522', '1f523', '1f524',
    '1f170', '1f18e', '1f171', '1f191', '1f192', '1f193', '2139', '1f194', '24c2',
    '1f196', '1f197', '1f17e', '1f198', '1f199', '1f19a', '1f201', '1f202', '1f237',
    '1f236', '1f22f', '1f250', '1f239', '1f21a', '1f232', '1f251', '1f238', '1f234',
    '1f233', '3297', '3299', '1f234', '1f235', '1f534', '1f7e0', '1f7e1', '1f7e2',
    '1f535', '1f7e3', '1f7e4', '26ab', '26aa', '1f7e5', '1f7e7', '1f7e8', '1f7e9',
    '1f7e6', '1f7ea', '1f7eb', '2b1b', '2b1c', '25fc', '25fb', '25fe', '25fd',
    '25aa', '25ab', '1f536', '1f537', '1f538', '1f539', '1f53a', '1f53b', '1f4a0',
    '1f518', '1f533', '1f532'
  ], 'symbol emoji', 'symbol heart sign shape button icon')
]

function bulk(
  category: string,
  codepointSequences: string[],
  labelPrefix: string,
  keywords: string
): EmojiSource[] {
  return codepointSequences.map((sequence) => ({
    category,
    codepoints: sequence.split(/\s+/).filter(Boolean),
    label: `${labelPrefix} ${sequence}`,
    keywords: tokenize(keywords)
  }))
}

const EMOJI_RECORDS: EmojiRecord[] = EMOJI_SOURCES.map((source) => {
  const symbol = u(...source.codepoints)
  const labelTokens = new Set(tokenize(source.label))
  const tokens = new Set([
    source.category,
    ...labelTokens,
    ...source.keywords.flatMap(tokenize)
  ])

  return {
    symbol,
    category: source.category,
    label: source.label,
    keywords: source.keywords,
    tokens,
    labelTokens
  }
})

export const EMOJI_CATEGORIES: EmojiCategory[] = CATEGORY_DEFINITIONS.map((category) => ({
  ...category,
  emojis: unique(
    EMOJI_RECORDS.filter((record) => record.category === category.id).map((record) => record.symbol)
  )
}))

export const EMOJI_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  EMOJI_RECORDS.map((record) => [record.symbol, [record.label, record.category, ...record.keywords]])
)

const ALIAS_GROUPS = [
  ['emoji', 'emote', 'reaction', 'icon'],
  ['sound', 'audio', 'music', 'speaker', 'volume', 'noise', 'sfx'],
  ['alert', 'notification', 'notify', 'bell', 'warning', 'ping', 'ding'],
  ['gift', 'present', 'donation', 'donate', 'rose', 'tip', 'tipped'],
  ['follow', 'follower', 'viewer', 'user', 'welcome', 'newbie', 'incoming'],
  ['sub', 'subs', 'subscriber', 'subscription', 'member', 'vip', 'fan', 'patron'],
  ['laugh', 'lol', 'haha', 'funny', 'rofl', 'lmao', 'chuckle', 'giggle'],
  ['happy', 'smile', 'joy', 'excited', 'glad', 'cheerful', 'yay'],
  ['sad', 'cry', 'sob', 'tears', 'unhappy', 'depressed', 'mourn'],
  ['love', 'heart', 'crush', 'romance', 'kiss', 'adore'],
  ['hype', 'fire', 'lit', 'party', 'celebrate', 'pog', 'poggers', 'epic', 'bangin'],
  ['money', 'cash', 'coin', 'dollar', 'points', 'bucks', 'rich', 'wealth'],
  ['game', 'gaming', 'controller', 'gamer', 'esports', 'play'],
  ['settings', 'setup', 'tool', 'tools', 'wrench', 'config', 'preferences'],
  ['image', 'photo', 'picture', 'camera', 'pic', 'snapshot'],
  ['skull', 'dead', 'ded', 'rip', 'bones', 'skeleton'],
  ['cool', 'rad', 'sick', 'awesome', 'dope', 'shades', 'sunglasses'],
  ['angry', 'mad', 'rage', 'pissed', 'furious', 'salty'],
  ['shock', 'shocked', 'surprised', 'wow', 'omg', 'amazed'],
  ['food', 'meal', 'eat', 'hungry', 'snack', 'tasty', 'delicious'],
  ['drink', 'beverage', 'thirsty', 'cup', 'glass'],
  ['cat', 'kitty', 'kitten', 'feline', 'meow'],
  ['dog', 'doggo', 'puppy', 'pup', 'canine', 'woof'],
  ['ok', 'okay', 'good', 'fine', 'approve', 'yes', 'yeah'],
  ['no', 'nope', 'reject', 'deny', 'banned', 'blocked'],
  ['hi', 'hello', 'wave', 'hey', 'greetings', 'sup'],
  ['bye', 'goodbye', 'farewell', 'cya', 'later', 'peace'],
  ['shrug', 'idk', 'whatever', 'meh'],
  ['thinking', 'think', 'hmm', 'pondering', 'consider'],
  ['confused', 'lost', 'huh', 'what'],
  ['scared', 'afraid', 'fear', 'spooked', 'terrified']
]

const ALIASES = createAliasMap(ALIAS_GROUPS)

export function searchEmojis(query: string, categoryId?: string, limit = 84): string[] {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return categoryId
      ? EMOJI_CATEGORIES.find((category) => category.id === categoryId)?.emojis ?? []
      : EMOJI_RECORDS.slice(0, limit).map((record) => record.symbol)
  }

  const directMatches = EMOJI_RECORDS.filter((record) => trimmedQuery.includes(record.symbol))
  if (directMatches.length > 0) {
    return unique(directMatches.map((record) => record.symbol))
  }

  const queryGroups = tokenize(trimmedQuery).map((token) => expandToken(token))
  if (queryGroups.length === 0) return []

  return EMOJI_RECORDS.map((record) => ({
    record,
    score: scoreRecord(record, queryGroups)
  }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.record.label.localeCompare(right.record.label))
    .slice(0, limit)
    .map((result) => result.record.symbol)
}

// ----- Recently used tracking ---------------------------------------------

const RECENT_KEY = 'ilystream.recent_emojis'
const RECENT_LIMIT = 32

export function getRecentEmojis(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function rememberEmoji(emoji: string): void {
  if (!emoji || typeof localStorage === 'undefined') return
  try {
    const current = getRecentEmojis().filter((entry) => entry !== emoji)
    const next = [emoji, ...current].slice(0, RECENT_LIMIT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
}

export function clearRecentEmojis(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    // ignore
  }
}

function e(category: string, codepoint: string, label: string, keywords: string): EmojiSource
function e(
  category: string,
  codepointA: string,
  codepointB: string,
  label: string,
  keywords: string
): EmojiSource
function e(
  category: string,
  codepointA: string,
  codepointB: string,
  codepointC: string,
  codepointD: string,
  label: string,
  keywords: string
): EmojiSource
function e(category: string, ...parts: string[]): EmojiSource {
  const keywords = parts.pop() ?? ''
  const label = parts.pop() ?? ''
  return {
    category,
    codepoints: parts,
    label,
    keywords: tokenize(keywords)
  }
}

function tokenize(value: string): string[] {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/&/g, ' and ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(stemToken)
    .filter(Boolean)
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function createAliasMap(groups: string[][]): Map<string, string[]> {
  const aliases = new Map<string, Set<string>>()

  for (const group of groups) {
    const normalizedGroup = unique(group.flatMap(tokenize))
    for (const token of normalizedGroup) {
      const current = aliases.get(token) ?? new Set<string>()
      normalizedGroup.forEach((alias) => current.add(alias))
      aliases.set(token, current)
    }
  }

  return new Map(Array.from(aliases.entries()).map(([token, values]) => [token, Array.from(values)]))
}

function expandToken(token: string): string[] {
  return unique([token, ...(ALIASES.get(token) ?? [])])
}

function scoreRecord(record: EmojiRecord, queryGroups: string[][]): number {
  let score = 0

  for (const group of queryGroups) {
    let best = 0

    for (const queryToken of group) {
      if (record.labelTokens.has(queryToken)) best = Math.max(best, 80)
      if (record.tokens.has(queryToken)) best = Math.max(best, 64)

      for (const recordToken of record.tokens) {
        if (recordToken === queryToken) best = Math.max(best, 64)
        else if (recordToken.startsWith(queryToken)) best = Math.max(best, 42)
        else if (recordToken.includes(queryToken) || queryToken.includes(recordToken)) {
          best = Math.max(best, 24)
        } else if (isSubsequence(queryToken, recordToken)) {
          best = Math.max(best, 8)
        } else if (isCloseEdit(queryToken, recordToken)) {
          // Tolerate single-character typos / transpositions (e.g. "smle" -> "smile").
          best = Math.max(best, 16)
        }
      }
    }

    if (best === 0) return 0
    score += best
  }

  return score
}

/**
 * Returns true when two tokens are within a single-character edit
 * (insertion, deletion, substitution, or adjacent transposition).
 * Cheap typo-tolerance for short queries — bails early for very different lengths.
 */
function isCloseEdit(a: string, b: string): boolean {
  if (a.length < 4 && b.length < 4) return false
  if (Math.abs(a.length - b.length) > 1) return false

  // Adjacent transposition: same length, exactly one swapped pair.
  if (a.length === b.length) {
    let mismatchIndex = -1
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        if (mismatchIndex === -1) {
          mismatchIndex = i
        } else if (
          mismatchIndex === i - 1 &&
          a[mismatchIndex] === b[i] &&
          a[i] === b[mismatchIndex]
        ) {
          // verify the rest of the strings match
          return a.slice(i + 1) === b.slice(i + 1)
        } else {
          // Single-char substitution — count how many mismatches total.
          break
        }
      }
    }

    // Single substitution: count mismatches.
    let diffs = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffs++
      if (diffs > 1) return false
    }
    return diffs === 1
  }

  // Length differs by 1 — one insertion/deletion.
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++
      j++
    } else {
      if (skipped) return false
      skipped = true
      j++
    }
  }
  return true
}

function isSubsequence(queryToken: string, recordToken: string): boolean {
  if (queryToken.length < 3) return false

  let queryIndex = 0
  for (const character of recordToken) {
    if (character === queryToken[queryIndex]) {
      queryIndex += 1
      if (queryIndex === queryToken.length) return true
    }
  }

  return false
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}
