const translations = {
  en: {
    title:  '🐱 Cat Cafe',
    p1:     'Welcome to our Cat Cafe! Here you can enjoy delicious coffee while spending time with adorable cats. It is a perfect place to relax and have fun.',
    link1:  'Visit our website',
    p2:     'Our cats are friendly and love to play with visitors. Come meet Luna, Milo, and Daisy, and enjoy a cozy and happy environment.',
    link2:  'Watch cat videos',
    toggle: 'Español'
  },
  es: {
    title:  '🐱 Café de Gatos',
    p1:     '¡Bienvenido a nuestro Café de Gatos! Aquí puedes disfrutar de un delicioso café mientras pasas tiempo con adorables gatos. Es el lugar perfecto para relajarte y divertirte.',
    link1:  'Visita nuestro sitio web',
    p2:     'Nuestros gatos son amigables y les encanta jugar con los visitantes. Ven a conocer a Luna, Milo y Daisy, y disfruta de un ambiente acogedor y feliz.',
    link2:  'Ver videos de gatos',
    toggle: 'English'
  }
};

let currentLang = 'en';

function setLanguage(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  langBtn.textContent = t.toggle;
  currentLang = lang;
}


const langBtn = document.createElement('button');
langBtn.id = 'lang-btn';
langBtn.textContent = 'Español';
langBtn.addEventListener('click', () => {
  setLanguage(currentLang === 'en' ? 'es' : 'en');
});

const style = document.createElement('style');
style.textContent = `
  #lang-btn {
    position: absolute;
    top: 16px;
    right: 20px;
    z-index: 10;
    padding: 8px 20px;
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
    border: 2px solid rgba(255, 255, 255, 0.55);
    font-family: 'Lato', sans-serif;
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-radius: 50px;
    cursor: pointer;
    transition: background 0.3s ease, transform 0.2s ease;
  }
  #lang-btn:hover {
    background: rgba(255, 255, 255, 0.38);
    transform: translateY(-1px);
  }
`;
document.head.appendChild(style);

document.querySelector('header').appendChild(langBtn);
