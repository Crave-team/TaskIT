import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Camera, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Avatar from '../common/Avatar';
import { useProfile } from '../../context/ProfileContext';
import { useApi } from '../../context/ApiContext';

const colorOptions = ['brand', 'coral', 'sage', 'amber'];
const colorDot = { brand: 'bg-brand-500', coral: 'bg-coral-500', sage: 'bg-sage-500', amber: 'bg-amber-500' };
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Modal form for editing the signed-in user's profile: name, email, role,
 * and their avatar — upload a photo (sent through the file service when you save,
 * not embedded in the profile) or pick an accent color for their initials circle.
 * Saves through ProfileContext so the top nav and Settings page stay in sync.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function EditProfileModal({ open, onClose }) {
  const { profile, updateProfile } = useProfile();
  const { api } = useApi();
  // The typed name / email / role and the chosen colour survive a refresh. A newly picked photo cannot (it is only in
  // the browser's memory until saved), so that part starts again from the saved profile.
  const [form, setForm, restored] = usePersistedState('editProfile.form', { name: '', email: '', role: '' });
  const [errors, setErrors] = useState({});
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null); // a newly picked photo, uploaded on save
  const [avatarColor, setAvatarColor] = usePersistedState('editProfile.avatarColor', 'brand');
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);

  const restoredWhileOpen = useRef(restored && open);
  useEffect(() => {
    if (open) {
      if (!restoredWhileOpen.current) {
        setForm({ name: profile.name, email: profile.email, role: profile.role });
        setAvatarColor(profile.avatarColor || 'brand');
      }
      setAvatarUrl(profile.avatarUrl);
      setAvatarFile(null);
      setErrors({});
      setPhotoError('');
    } else {
      restoredWhileOpen.current = false;
    }
    // Only re-seed the form when the dialog opens, never while the person is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const previewProfile = {
    ...profile,
    name: form.name || profile.name,
    avatarUrl,
    avatarColor,
    avatarInitials: (form.name || profile.name)
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  };

  const handlePhotoChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPhotoError('Image must be under 2MB.');
      return;
    }
    setPhotoError('');
    // Local preview only; the file is uploaded when the person presses Save.
    if (avatarFile && avatarUrl) URL.revokeObjectURL(avatarUrl);
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    if (avatarFile && avatarUrl) URL.revokeObjectURL(avatarUrl);
    setAvatarFile(null);
    setAvatarUrl(null);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.email.trim()) {
      e.email = 'Email is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      e.email = 'Enter a valid email address.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate() || saving) return;
    setSaving(true);
    const patch = { name: form.name.trim(), email: form.email.trim(), role: form.role.trim(), avatarColor };
    if (avatarFile) {
      const file = await api.files.uploadFile(avatarFile);
      patch.avatarUrl = file.url;
      patch.avatarFileId = file.id;
    } else if (!avatarUrl) {
      patch.avatarUrl = null;
      patch.avatarFileId = null;
    }
    const result = await updateProfile(patch);
    setSaving(false);
    if (!result.success) {
      setErrors({ [result.field || 'email']: result.error });
      return;
    }
    onClose();
  };

  const inputClass =
    'w-full text-fluid-sm bg-white dark:bg-surface-dark border rounded-lg px-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none';
  const borderFor = (field) =>
    errors[field] ? 'border-coral-500' : 'border-ink-500/15 dark:border-white/10';
  const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit}>Save changes</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className={labelClass}>Photo</label>
          <div className="flex items-center gap-4">
            <Avatar profile={previewProfile} size={64} />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-fluid-xs font-medium bg-ink-500/10 dark:bg-white/10 text-ink-700 dark:text-ink-300 rounded-lg px-3 py-1.5 hover:bg-ink-500/15 dark:hover:bg-white/15 transition-colors"
                >
                  <Camera size={13} /> Upload photo
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="flex items-center gap-1.5 text-fluid-xs font-medium text-coral-600 hover:bg-coral-500/8 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhotoChange(e.target.files?.[0])}
              />
              {photoError ? (
                <p className="text-fluid-xs text-coral-600">{photoError}</p>
              ) : !avatarUrl ? (
                <div className="flex items-center gap-1.5">
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAvatarColor(c)}
                      aria-label={`Use ${c} avatar color`}
                      className={`w-5 h-5 rounded-full ${colorDot[c]} transition-transform ${avatarColor === c ? 'ring-2 ring-offset-2 ring-ink-900 dark:ring-white dark:ring-offset-surface-darkcard scale-105' : ''}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-fluid-xs text-ink-500">JPG or PNG, up to 2MB.</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="profile-name" className={labelClass}>Full name</label>
          <input
            id="profile-name"
            className={`${inputClass} ${borderFor('name')}`}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Jordan Lee"
          />
          {errors.name && <p className="text-fluid-xs text-coral-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="profile-email" className={labelClass}>Email</label>
          <input
            id="profile-email"
            type="email"
            className={`${inputClass} ${borderFor('email')}`}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="you@company.com"
          />
          {errors.email && <p className="text-fluid-xs text-coral-600 mt-1">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="profile-role" className={labelClass}>Role / title</label>
          <input
            id="profile-role"
            className={`${inputClass} ${borderFor('role')}`}
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            placeholder="e.g. Product Operations Lead"
          />
        </div>
      </form>
    </Modal>
  );
}
