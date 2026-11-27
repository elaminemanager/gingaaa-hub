// Hub Gingaaa : filtres par réseau, partage et lecture des vidéos sans quitter la page.
(function () {
  var doc = document;

  // Filtre par réseau sur les cartes de la page.
  var chips = doc.querySelectorAll('.chip[data-filter]');
  var empty = doc.querySelector('.empty');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var net = chip.dataset.filter;
      var scope = chip.closest('main') || doc;
      scope.querySelectorAll('.chip[data-filter]').forEach(function (c) { c.classList.toggle('is-on', c === chip); });
      var shown = 0;
      scope.querySelectorAll('.grid > .card').forEach(function (card) {
        var ok = net === 'all' || card.dataset.net.split(' ').indexOf(net) !== -1;
        card.hidden = !ok;
        if (ok) shown++;
      });
      var note = scope.querySelector('.empty') || empty;
      if (note) note.hidden = shown > 0;
    });
  });

  // Copier le lien.
  doc.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var done = function (ok) {
      var old = btn.dataset.label || btn.textContent;
      btn.dataset.label = old;
      btn.textContent = ok ? 'Lien copié' : btn.dataset.copy;
      if (ok) setTimeout(function () { btn.textContent = old; }, 1800);
    };
    try {
      navigator.clipboard.writeText(btn.dataset.copy).then(function () { done(true); }, function () { done(false); });
    } catch (err) { done(false); }
  });

  // Partage natif du téléphone, quand il existe.
  if (navigator.share && !window.GINGAAA_PREVIEW) {
    doc.querySelectorAll('[data-share]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        navigator.share({ title: btn.dataset.title, url: btn.dataset.share }).catch(function () {});
      });
    });
  }

  // Lecteur : l'image d'abord, la vidéo de la plateforme au clic (page légère, vues comptées chez la plateforme).
  doc.addEventListener('click', function (e) {
    var play = e.target.closest('.player .play');
    if (!play) return;
    var box = play.closest('.player');
    if (window.GINGAAA_PREVIEW || !box.dataset.embed) {
      if (!window.GINGAAA_PREVIEW && box.dataset.url) { window.open(box.dataset.url, '_blank', 'noopener'); return; }
      play.textContent = 'En ligne, la publication se lit ici, sans quitter la page';
      play.classList.add('is-note');
      return;
    }
    var frame = doc.createElement('iframe');
    frame.src = box.dataset.embed;
    frame.title = 'Publication Gingaaa';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.loading = 'lazy';
    box.textContent = '';
    box.classList.add('is-live');
    box.appendChild(frame);
  });
})();
