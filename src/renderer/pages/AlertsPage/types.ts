import { AppSettings, DEFAULT_APP_SETTINGS } from '../../../shared/app-settings'

export type AlertKind = 'Gift' | 'Follow' | 'Superfan'

export const ALERT_KINDS: AlertKind[] = ['Gift', 'Follow', 'Superfan']

export type EventSoundSettingKey =
  | `eventSound${AlertKind}Enabled`
  | `eventSound${AlertKind}SoundId`
  | `eventSound${AlertKind}Volume`
  | `eventImage${AlertKind}Enabled`
  | `eventImage${AlertKind}AssetId`
  | `eventAlert${AlertKind}ImageTop`
  | `eventAlert${AlertKind}ImageLeft`
  | `eventText${AlertKind}Enabled`
  | `eventText${AlertKind}Template`
  | `eventText${AlertKind}Color`
  | `eventText${AlertKind}BackgroundColor`
  | `eventText${AlertKind}BorderColor`
  | `eventText${AlertKind}FontSize`
  | `eventAlert${AlertKind}Layout`
  | `eventAlert${AlertKind}AnimationIn`
  | `eventAlert${AlertKind}AnimationOut`
  | `eventAlert${AlertKind}DurationMs`
  | `eventAlert${AlertKind}TextShadow`
  | `eventAlert${AlertKind}FontWeight`
  | 'alertTop'
  | 'alertLeft'

export type EventSoundSettings = Pick<AppSettings, EventSoundSettingKey>

export const EVENT_SOUND_SETTING_KEYS: EventSoundSettingKey[] = [
  ...ALERT_KINDS.flatMap((kind) => [
    `eventSound${kind}Enabled`,
    `eventSound${kind}SoundId`,
    `eventSound${kind}Volume`,
    `eventImage${kind}Enabled`,
    `eventImage${kind}AssetId`,
    `eventAlert${kind}ImageTop`,
    `eventAlert${kind}ImageLeft`,
    `eventText${kind}Enabled`,
    `eventText${kind}Template`,
    `eventText${kind}Color`,
    `eventText${kind}BackgroundColor`,
    `eventText${kind}BorderColor`,
    `eventText${kind}FontSize`,
    `eventAlert${kind}Layout`,
    `eventAlert${kind}AnimationIn`,
    `eventAlert${kind}AnimationOut`,
    `eventAlert${kind}DurationMs`,
    `eventAlert${kind}TextShadow`,
    `eventAlert${kind}FontWeight`
  ] as EventSoundSettingKey[]),
  'alertTop',
  'alertLeft'
]

export function pickEventSoundSettings(settings: AppSettings): EventSoundSettings {
  const picked = {} as any

  for (const key of EVENT_SOUND_SETTING_KEYS) {
    picked[key] = settings[key]
  }

  return picked as EventSoundSettings
}

export const defaultEventSoundSettings: EventSoundSettings =
  pickEventSoundSettings(DEFAULT_APP_SETTINGS)
