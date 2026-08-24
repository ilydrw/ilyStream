import { describe, expect, it } from 'vitest'
import { StreamIncidentLog } from './stream-incident-log'

describe('StreamIncidentLog', () => {
  it('retains only the newest bounded incidents', () => {
    const log = new StreamIncidentLog(2)

    log.add({ outputId: 'one', outputName: 'One', kind: 'started', at: 1, message: 'Started' })
    log.add({ outputId: 'two', outputName: 'Two', kind: 'reconnecting', at: 2, message: 'Retrying' })
    log.add({ outputId: 'three', outputName: 'Three', kind: 'failed', at: 3, message: 'Failed' })

    expect(log.list()).toEqual([
      expect.objectContaining({ outputId: 'two', kind: 'reconnecting' }),
      expect.objectContaining({ outputId: 'three', kind: 'failed' })
    ])
  })

  it('returns copies so renderer-facing consumers cannot mutate retained state', () => {
    const log = new StreamIncidentLog()
    log.add({ outputId: 'twitch', outputName: 'Twitch', kind: 'recovered', at: 10, message: 'Recovered', retry: 2 })

    const first = log.list()
    first[0].message = 'Changed'

    expect(log.list(1)[0]).toMatchObject({
      outputId: 'twitch',
      kind: 'recovered',
      message: 'Recovered',
      retry: 2
    })
  })
})
