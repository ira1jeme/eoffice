import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../api/client';

export function Login() {
  const { user, login } = useAuth();

  const navigate = useNavigate();

  // ==========================================================================
  // LOGIN
  // ==========================================================================

  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');

  // ==========================================================================
  // CHANGE PASSWORD
  // ==========================================================================

  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  // ==========================================================================
  // UI
  // ==========================================================================

  const [showChangePassword, setShowChangePassword] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [changingPassword, setChangingPassword] =
    useState(false);

  // ==========================================================================
  // REDIRECT IF ALREADY LOGGED IN
  // ==========================================================================

  if (user) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  // ==========================================================================
  // LOGIN
  // ==========================================================================

  async function handleSubmit(
    e: FormEvent
  ) {
    e.preventDefault();

    setError(null);

    setSuccess(null);

    setSubmitting(true);

    try {
      await login(
        email,
        password
      );

      navigate(
        '/',
        {
          replace: true,
        }
      );
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Login failed. Check your credentials.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================================================
  // CHANGE PASSWORD BEFORE LOGIN
  // ==========================================================================

  async function handleChangePassword() {
    setError(null);

    setSuccess(null);

    // ------------------------------------------------------------------------
    // Validate email
    // ------------------------------------------------------------------------

    if (!email) {
      setError(
        'Please enter your email address first.'
      );

      return;
    }

    // ------------------------------------------------------------------------
    // Validate current password
    // ------------------------------------------------------------------------

    if (!currentPassword) {
      setError(
        'Please enter your current password.'
      );

      return;
    }

    // ------------------------------------------------------------------------
    // Validate new password
    // ------------------------------------------------------------------------

    if (!newPassword) {
      setError(
        'Please enter a new password.'
      );

      return;
    }

    if (newPassword.length < 8) {
      setError(
        'New password must be at least 8 characters.'
      );

      return;
    }

    // ------------------------------------------------------------------------
    // Validate confirmation
    // ------------------------------------------------------------------------

    if (!confirmPassword) {
      setError(
        'Please retype your new password.'
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setError(
        'New password and retyped password do not match.'
      );

      return;
    }

    // ------------------------------------------------------------------------
    // Send request
    // ------------------------------------------------------------------------

    setChangingPassword(true);

    try {
      const response =
        await api.post(
          '/auth/change-password-before-login',
          {
            email,
            currentPassword,
            newPassword,
            confirmPassword,
          }
        );

      // ----------------------------------------------------------------------
      // Success
      // ----------------------------------------------------------------------

      setSuccess(
        response.data.message ||
          'Password changed successfully.'
      );

      // Clear password fields
      setCurrentPassword('');

      setNewPassword('');

      setConfirmPassword('');

    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Unable to change password.'
        )
      );
    } finally {
      setChangingPassword(false);
    }
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">

      <div className="w-full max-w-sm">

        {/* ================================================================== */}
        {/* HEADER */}
        {/* ================================================================== */}

        <div className="mb-8 text-center">

          <div className="mx-auto mb-3 flex h-11 w-auto items-center justify-center rounded-[4px] border border-amber-500/60 px-4 font-mono text-sm font-semibold text-amber-500">
            PIU-Silchar
          </div>

          <h1 className="font-display text-xl font-semibold text-white">
            e-Office
          </h1>

          <p className="mt-1 text-sm text-navy-100/60">
            Internal Task &amp; File Management System
          </p>

        </div>

        {/* ================================================================== */}
        {/* LOGIN FORM */}
        {/* ================================================================== */}

        {!showChangePassword && (
          <form
            onSubmit={handleSubmit}
            className="card space-y-4 p-6"
          >

            {/* Error */}
            {error && (
              <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="rounded-md border-l-2 border-l-green-500 bg-green-50 px-3 py-2 text-sm text-green-600">
                {success}
              </div>
            )}

            {/* ============================================================ */}
            {/* EMAIL */}
            {/* ============================================================ */}

            <div>

              <label
                className="label"
                htmlFor="email"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                required
                autoFocus
                className="input"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                placeholder="you@eoffice.local"
              />

            </div>

            {/* ============================================================ */}
            {/* PASSWORD */}
            {/* ============================================================ */}

            <div>

              <label
                className="label"
                htmlFor="password"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                placeholder="••••••••"
              />

            </div>

            {/* ============================================================ */}
            {/* LOGIN BUTTON */}
            {/* ============================================================ */}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting
                ? 'Signing in…'
                : 'Sign in'}
            </button>

            {/* ============================================================ */}
            {/* CHANGE PASSWORD */}
            {/* ============================================================ */}

            <div className="text-center">

              <button
                type="button"
                onClick={() => {
                  setShowChangePassword(
                    true
                  );

                  setError(null);

                  setSuccess(null);
                }}
                className="text-xs font-medium text-amber-500 hover:text-amber-400"
              >
                Change Password
              </button>

            </div>

          </form>
        )}

        {/* ================================================================== */}
        {/* CHANGE PASSWORD FORM */}
        {/* ================================================================== */}

        {showChangePassword && (
          <div className="card p-6">

            {/* ============================================================ */}
            {/* TITLE */}
            {/* ============================================================ */}

            <div className="mb-5">

              <h2 className="text-base font-semibold text-white">
                Change Password
              </h2>

              <p className="mt-1 text-xs leading-5 text-navy-100/60">
                You do not need to log in first.
                Enter your email and current password
                to create a new password.
              </p>

            </div>

            {/* ============================================================ */}
            {/* ERROR */}
            {/* ============================================================ */}

            {error && (
              <div className="mb-4 rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
                {error}
              </div>
            )}

            {/* ============================================================ */}
            {/* SUCCESS */}
            {/* ============================================================ */}

            {success && (
              <div className="mb-4 rounded-md border-l-2 border-l-green-500 bg-green-50 px-3 py-2 text-sm text-green-600">
                {success}
              </div>
            )}

            <div className="space-y-4">

              {/* ========================================================== */}
              {/* EMAIL */}
              {/* ========================================================== */}

              <div>

                <label
                  className="label"
                  htmlFor="changeEmail"
                >
                  Email
                </label>

                <input
                  id="changeEmail"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder="you@eoffice.local"
                />

              </div>

              {/* ========================================================== */}
              {/* CURRENT PASSWORD */}
              {/* ========================================================== */}

              <div>

                <label
                  className="label"
                  htmlFor="currentPassword"
                >
                  Current Password
                </label>

                <input
                  id="currentPassword"
                  type="password"
                  className="input"
                  value={currentPassword}
                  onChange={(e) =>
                    setCurrentPassword(
                      e.target.value
                    )
                  }
                  placeholder="••••••••"
                />

              </div>

              {/* ========================================================== */}
              {/* NEW PASSWORD */}
              {/* ========================================================== */}

              <div>

                <label
                  className="label"
                  htmlFor="newPassword"
                >
                  New Password
                </label>

                <input
                  id="newPassword"
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(
                      e.target.value
                    )
                  }
                  placeholder="••••••••"
                />

                <p className="mt-1 text-xs text-navy-100/40">
                  Minimum 8 characters
                </p>

              </div>

              {/* ========================================================== */}
              {/* RETYPE NEW PASSWORD */}
              {/* ========================================================== */}

              <div>

                <label
                  className="label"
                  htmlFor="confirmPassword"
                >
                  Retype New Password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  placeholder="••••••••"
                />

              </div>

              {/* ========================================================== */}
              {/* CHANGE PASSWORD BUTTON */}
              {/* ========================================================== */}

              <button
                type="button"
                disabled={changingPassword}
                onClick={
                  handleChangePassword
                }
                className="btn-primary w-full"
              >
                {changingPassword
                  ? 'Changing Password…'
                  : 'Change Password'}
              </button>

              {/* ========================================================== */}
              {/* BACK TO LOGIN */}
              {/* ========================================================== */}

              <button
                type="button"
                onClick={() => {
                  setShowChangePassword(
                    false
                  );

                  setCurrentPassword('');

                  setNewPassword('');

                  setConfirmPassword('');

                  setError(null);

                  setSuccess(null);
                }}
                className="w-full text-xs text-navy-100/50 hover:text-white"
              >
                ← Back to Login
              </button>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}