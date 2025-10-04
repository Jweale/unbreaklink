const handleClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const anchor = event.target.closest('a');
  if (!anchor) {
    return;
  }

  console.debug('Intercepted click for', anchor.href);
};

window.addEventListener('click', handleClick, { capture: true });
