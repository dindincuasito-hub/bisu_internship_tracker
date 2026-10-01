// Small helper for login show/hide password toggle
document.addEventListener('DOMContentLoaded', () => {
  const passInput = document.getElementById('login-pass');
  const toggle = document.getElementById('login-pass-toggle');
  if (!passInput || !toggle) return;
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    const icon = toggle.querySelector('i');
    if (passInput.type === 'password') {
      passInput.type = 'text';
      if (icon) { icon.classList.remove('bi-eye'); icon.classList.add('bi-eye-slash'); }
      toggle.setAttribute('aria-label', 'Hide password');
    } else {
      passInput.type = 'password';
      if (icon) { icon.classList.remove('bi-eye-slash'); icon.classList.add('bi-eye'); }
      toggle.setAttribute('aria-label', 'Show password');
    }
  });
});
