export interface UserStatRow {
  username: string
  platform: string
  platform_user_id: string | null
  display_name: string
  profile_picture_url: string | null
  total_likes: number
  total_gifts: number
  total_gift_value_cents: number
  total_subscriptions: number
  total_follows: number
  total_shares: number
  total_raids: number
  total_chats: number
  total_song_requests: number
  total_cohost_calls: number
  is_fan_club_member: number
  is_super_fan: number
  is_moderator: number
  moderator_badge_image_url: string | null
  tiktok_fan_club_badge_image_url: string | null
  tiktok_super_fan_badge_image_url: string | null
  twitch_sub_badge_image_url: string | null
  youtube_super_fan_badge_image_url: string | null
  profile_id: string | null
  first_seen_at: string
  last_seen_at: string
}
