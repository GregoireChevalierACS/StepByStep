// Format : "yyyy-mm-dd # N : (type) message"
// Exemple : "2026-10-05 # 1 : (chore) Installation des deps et mise en place de x"
const TYPES = [
  'feat',
  'fix',
  'test',
  'refactor',
  'chore',
  'docs',
  'style',
  'perf',
  'build',
  'ci',
  'revert',
];

const HEADER_PATTERN = /^(\d{4}-\d{2}-\d{2}) +# *(\d+) +: +\(([a-z]+)\) +(\S.*)$/;
const FORMAT_HINT =
  'yyyy-mm-dd # N : (type) message, ex. "2026-10-05 # 1 : (chore) Mise en place de x"';

const isRealDate = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso);
};

export default {
  parserPreset: {
    parserOpts: {
      headerPattern: HEADER_PATTERN,
      headerCorrespondence: ['date', 'dailyNumber', 'type', 'subject'],
    },
  },
  plugins: [
    {
      rules: {
        'stepbystep-header-format': ({ header }) => {
          const match = HEADER_PATTERN.exec(header ?? '');
          if (!match) return [false, `l'en-tête doit respecter le format : ${FORMAT_HINT}`];
          const [, date = '', dailyNumber = ''] = match;
          if (!isRealDate(date)) return [false, `la date "${date}" n'existe pas`];
          if (Number(dailyNumber) < 1) return [false, 'le numéro du commit du jour commence à 1'];
          return [true];
        },
      },
    },
  ],
  rules: {
    'stepbystep-header-format': [2, 'always'],
    'type-empty': [2, 'never'],
    'type-enum': [2, 'always', TYPES],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 120],
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
  },
};
