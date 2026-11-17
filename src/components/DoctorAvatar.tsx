import { useState } from 'react';

interface DoctorAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function DoctorAvatar({ name, avatarUrl, size = 'md' }: DoctorAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    .replace(/^Dr\.\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const sizeClass =
    size === 'sm' ? 'w-9 h-9 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-sm';

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-lg border border-slate-200 bg-teal-50 text-teal-800 font-semibold flex items-center justify-center shrink-0 select-none`}
      aria-label={name}
    >
      {initials || 'DR'}
    </div>
  );
}
