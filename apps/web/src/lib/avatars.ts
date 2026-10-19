/** Role portrait paths under /public/avatars (user-supplied photos). */
export const ROLE_AVATAR: Record<string, string> = {
  SPEAKER: '/avatars/speaker.png',
  SECRETARY_GENERAL: '/avatars/secretary_general.png',
  SPECIAL_SECRETARY: '/avatars/special_secretary.png',
  DG_IT: '/avatars/dg_it.png',
  ADMIN: '/avatars/dg_it.png',
};

export function roleAvatar(role: string | undefined | null) {
  if (!role) return null;
  return ROLE_AVATAR[role] || null;
}
