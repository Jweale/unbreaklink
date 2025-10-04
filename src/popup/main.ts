const app = document.querySelector('#app');

if (app) {
  const status = document.createElement('p');
  status.textContent = 'Ready to restore modifier clicks.';
  app.append(status);
}
