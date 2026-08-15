(function () {
  'use strict';
  if (location.pathname.indexOf('/work/') === -1) return;
  var workItem = document.querySelector('.menu-item[data-secao="work"]');
  if (!workItem) return;
  workItem.setAttribute('href', './');
  var leaf = location.pathname.split('/').pop();
  if (!leaf || leaf === 'index.html') workItem.setAttribute('aria-current', 'page');
  var contactItem = document.querySelector('.menu-item[data-secao="contact"]');
  if (contactItem) contactItem.setAttribute('href', '#site-footer');
})();
