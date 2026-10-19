// shared chrome behaviour: the "?" help bubble in the bottom toolbar
const help = document.getElementById('help'), helpBtn = document.getElementById('helpBtn');
if (help && helpBtn) {
  let hide = 0;
  helpBtn.addEventListener('click', () => {
    help.classList.toggle('show');
    clearTimeout(hide);
    if (help.classList.contains('show')) hide = setTimeout(() => help.classList.remove('show'), 3500);
  });
}
