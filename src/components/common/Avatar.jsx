import { useFileUrl } from '../../hooks/useFileUrl';

const colorClass = {
  brand: 'bg-brand-500',
  coral: 'bg-coral-500',
  sage: 'bg-sage-500',
  amber: 'bg-amber-500',
};

/**
 * Shows the signed-in user's uploaded photo when set, otherwise a colored
 * circle with their initials. Used anywhere the profile avatar appears so
 * a photo upload or color choice shows up consistently across the app.
 *
 * @param {{ profile: { avatarUrl?: string|null, avatarColor?: string, avatarInitials: string, name: string }, size?: number, className?: string }} props
 */
export default function Avatar({ profile, size = 40, className = '' }) {
  const dim = { width: size, height: size };
  // Photos served by the API load with the session header; the initials show until the photo arrives.
  const photo = useFileUrl(profile.avatarUrl);
  if (photo) {
    return (
      <img
        src={photo}
        alt={profile.name}
        style={dim}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={dim}
      className={`rounded-full text-white flex items-center justify-center font-semibold shrink-0 ${colorClass[profile.avatarColor] || colorClass.brand} ${className}`}
    >
      <span style={{ fontSize: Math.max(11, size * 0.38) }}>{profile.avatarInitials}</span>
    </div>
  );
}
