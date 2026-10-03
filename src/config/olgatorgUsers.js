import { ROLES } from '../constants/roles.js';

export const users = {
  'oliahrynyk32@gmail.com': {
    role: ROLES.AGENT,
    department: 'Область (Центр)',
    representative: 'Гриник Ольга',
  },

  'storoshdiana@gmail.com': {
    role: ROLES.AGENT,
    department: 'Місто',
    representative: 'Довга Діана',
  },

  'dyug.tany.90@gmail.com': {
    role: ROLES.AGENT,
    department: "Кам'янець-Подільський відділ",
    representative: 'Дюг Тетяна',
  },

  'y.stepanishin@gmail.com': {
    role: ROLES.ADMIN,
    department: 'Усі відділи',
    representative: 'Юрій Степанишин',
  },

  'gutovskan@gmail.com': {
    role: ROLES.MANAGER,
    department: 'Усі відділи',
    representative: 'Гутовська Наталія',
  },

  'valentyna.korniienko@tctrade.com.ua': {
    role: ROLES.BRAND_MANAGER,
    department: 'Усі відділи',
    representative: 'Корнієнко Валентина',
    brands: [
      'TESS',
      'Greenfield',
      'JARDIN',
      'PIAZZA',
      'Жокей',
      'Принцеса Ява',
      'Принцеса Нурі',
      'Принцеса Канді'
      ],
  },

  'ivsn.denis@gmail.com': {
    role: ROLES.AGENT,
    department: "Кам'янець-Подільський відділ",
    representative: 'Івасишин Денис',
  },
  'anna.stetsyuk25@gmail.com': {
    role: ROLES.AGENT,
    department: 'Шепетівський відділ',
    representative: 'Кучер Аня',
  },
  'laptevahm@gmail.com': {
    role: ROLES.AGENT,
    department: 'Місто',
    representative: 'Лаптєва Руслана',
  },
  'olenkapolonne@gmail.com': {
    role: ROLES.AGENT,
    department: 'Шепетівський відділ',
    representative: 'Мартинчик Альона',
  },
  'glukhovska.84@gmail.com': {
    role: ROLES.AGENT,
    department: 'Область (Центр)',
    representative: 'Могильна Оксана',
  },
  'svetlananagornak1984@gmail.com': {
    role: ROLES.AGENT,
    department: 'Шепетівський відділ',
    representative: 'Нагорняк Світлана',
  },
  'vlad-oliynik@ukr.net': {
    role: ROLES.AGENT,
    department: "Кам'янець-Подільський відділ",
    representative: 'Олійник Влад',
  },
  'alinakukolka84@gmail.com': {
    role: ROLES.AGENT,
    department: 'Область (Центр)',
    representative: 'Сторожук Аліна',
  },
  'irashwetc89@gmail.com': {
    role: ROLES.AGENT,
    department: 'Шепетівський відділ',
    representative: 'Швець Ірина',
  },
  'natasha14148282@icloud.com': {
    role: ROLES.AGENT,
    department: 'Місто',
    representative: 'Ящишина Наталія',
  },

  'vkamsnskiy@gmail.com': {
    role: ROLES.SUPERVISOR,
    departments: ["Кам'янець-Подільський відділ"],
    representative: 'Камінський Володимир',
  },
  'nikolya202@gmail.com': {
    role: ROLES.SUPERVISOR,
    departments: ['Шепетівський відділ'],
    representative: 'Микола Швець',
  },
  'w18051985@gmail.com': {
    role: ROLES.SUPERVISOR,
    departments: ['Місто', 'Область (Центр)'],
    representative: 'Токарчук Микола',
  },
};

export const getUserProfile = (email) => {
  if (!email) return null;

  return users[email.trim().toLowerCase()] || null;
};

export const allowedEmails = Object.keys(users);

export const buildSalesWhere = (user) => {
  switch (user.role) {
    case ROLES.ADMIN:
    case ROLES.MANAGER:
      return {
        where: '',
        params: [],
      };

    case ROLES.AGENT:
      return {
        where: 'WHERE agent_name = $1',
        params: [user.representative],
      };

    case ROLES.SUPERVISOR: {
      const agents = getAgentsByDepartments(user.departments);

      return {
        where: 'WHERE agent_name = ANY($1)',
        params: [agents],
      };
    }

    case ROLES.BRAND_MANAGER:
      return {
        where: 'WHERE tm = ANY($1)',
        params: [user.brands],
      };

    default:
      return null;
  }
};

function getAgentsByDepartments(departments) {
  return Object.values(users)
    .filter(
      (user) =>
        user.role === ROLES.AGENT && departments.includes(user.department),
    )
    .map((user) => user.representative);
};
export { getAgentsByDepartments };
