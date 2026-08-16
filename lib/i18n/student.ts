/**
 * Copy for the student and family trip page.
 *
 * The English object below is the source of truth for the shape; `StudentCopy`
 * is derived from it, so the Spanish object cannot compile while a string is
 * missing. See lib/i18n for why that matters.
 *
 * On the Spanish: it is written for a parent reading a permission slip, not for
 * a linguist. Plain register, `tú` throughout because the reader is a student
 * or a parent being addressed directly, and the institutional names kept in
 * English with a gloss on first use — a family looking for "Capitol South" on a
 * Metro sign needs the words that are on the sign.
 */

import type { Translations } from './index';

const en = {
  // --- page furniture -------------------------------------------------------
  languageLabel: 'Language',
  viewIn: 'Ver esta página en español',

  // --- what to bring --------------------------------------------------------
  bringHeading: 'Before you leave the house',
  leaveBehind: 'Leave these behind',
  leaveItems: [
    '**Food and drink of any kind**, including water bottles. None of it can come inside the Capitol.',
    '**Backpacks and large bags.** There is nowhere to store them — no lockers, no cloakroom, nothing. Whatever you bring, you carry all day.',
    'Anything sharp, including pocket knives and multi-tools.',
    'Aerosols, and liquids that are not medication.',
  ],
  bringThese: 'Bring these',
  bringItems: [
    'A phone, if you have one, with your teacher’s number saved.',
    'Any medication you need, and tell your teacher you have it.',
    'Comfortable shoes. You will be standing and walking for hours.',
    'A small amount of money for lunch, if your group is buying.',
  ],
  screening: (minutes: number) =>
    `Everyone goes through airport-style security screening to get in. Your group is arriving about ${minutes} minutes early specifically so that a group your size can get through it without losing the tour slot. If you bring something you should not have, that time disappears.`,

  // --- getting there --------------------------------------------------------
  gettingThereHeading: 'Getting there',
  walkMinutes: (minutes: number) =>
    `About ${minutes} minutes on foot from the station to the Visitor Center.`,

  // --- representative -------------------------------------------------------
  repHeading: 'Who represents you',
  portraitAlt: (name: string) => `Official portrait of ${name}`,
  committees: 'Committees',
  committeesNote:
    'Committees are where most of the actual work of Congress happens — bills are written, amended and killed here long before anyone votes on the floor.',

  // --- questions ------------------------------------------------------------
  questionsHeading: 'Ask a question',
  questionsIntro:
    'Your teacher picks the strongest questions and sends them to the office ahead of time. That gives the Member a chance to actually answer rather than give a stock reply — which is the difference between a photo op and a conversation.',
  questionSentTitle: 'Question submitted',
  questionSentBody: 'Your teacher will see it. You can submit another if you think of one.',
  questionErrorTitle: 'That did not go through',
  questionErrorBody: 'Add your name, and make the question at least a sentence long.',
  firstNameLabel: 'Your first name',
  questionLabel: 'Your question',
  questionHint:
    'Specific questions get real answers. “What is a vote you found hard to decide?” beats “What is it like being in Congress?”',
  submitQuestion: 'Submit question',
  chosenHeading: 'Questions your teacher chose',

  // --- civics ---------------------------------------------------------------
  civicsHeading: 'What you are actually walking into',
  civics: [
    {
      term: 'The building',
      description:
        'The Capitol houses both chambers of Congress — the House of Representatives in the south wing, the Senate in the north. The dome and the Rotunda sit between them. It has been in use since 1800, and has been rebuilt and extended repeatedly since.',
    },
    {
      term: 'The House',
      description:
        '435 voting members, each representing a district of roughly 760,000 people, all elected every two years. Yours is one of them. Because districts are drawn by population, a member from a dense city represents the same number of people as one from a large rural district.',
    },
    {
      term: 'The Senate',
      description:
        '100 members, two per state regardless of population, elected for six-year terms with a third of the seats up every two years. Wyoming and California each get two.',
    },
    {
      term: 'What your Representative actually does',
      description:
        'Far less floor voting than people expect. Most of the job is committee work, constituent casework — helping people in the district deal with federal agencies — and meetings. The tour you are on is itself a constituent service.',
    },
    {
      term: 'Why the chamber is often nearly empty',
      description:
        'Members are usually in committee hearings, meetings, or their offices, and come to the floor for votes. A near-empty chamber during a speech is normal, not a sign that nobody cares.',
    },
  ],
};

export type StudentCopy = typeof en;

const es: StudentCopy = {
  languageLabel: 'Idioma',
  viewIn: 'View this page in English',

  bringHeading: 'Antes de salir de casa',
  leaveBehind: 'Deja esto en casa',
  leaveItems: [
    '**Comida y bebida de cualquier tipo**, incluidas las botellas de agua. Nada de eso puede entrar al Capitolio.',
    '**Mochilas y bolsas grandes.** No hay dónde guardarlas: no hay casilleros ni guardarropa, nada. Lo que lleves, lo cargas todo el día.',
    'Cualquier objeto punzante, incluidas navajas y multiherramientas.',
    'Aerosoles, y líquidos que no sean medicamentos.',
  ],
  bringThese: 'Trae esto',
  bringItems: [
    'Un teléfono, si tienes uno, con el número de tu maestro o maestra guardado.',
    'Cualquier medicamento que necesites, y avísale a tu maestro o maestra que lo llevas.',
    'Zapatos cómodos. Vas a estar de pie y caminando durante horas.',
    'Un poco de dinero para el almuerzo, si tu grupo va a comprarlo.',
  ],
  screening: (minutes: number) =>
    `Todos pasan por un control de seguridad como el de un aeropuerto para entrar. Tu grupo llega unos ${minutes} minutos antes precisamente para que un grupo de su tamaño alcance a pasar sin perder su turno de visita. Si traes algo que no deberías, ese tiempo desaparece.`,

  gettingThereHeading: 'Cómo llegar',
  walkMinutes: (minutes: number) =>
    `Unos ${minutes} minutos a pie desde la estación hasta el Visitor Center (centro de visitantes).`,

  repHeading: 'Quién te representa',
  portraitAlt: (name: string) => `Retrato oficial de ${name}`,
  committees: 'Comités',
  committeesNote:
    'En los comités ocurre la mayor parte del trabajo real del Congreso: allí se redactan, se modifican y se descartan los proyectos de ley mucho antes de que alguien vote en el pleno.',

  questionsHeading: 'Haz una pregunta',
  questionsIntro:
    'Tu maestro o maestra elige las mejores preguntas y las envía a la oficina con anticipación. Eso le da al congresista la oportunidad de responder de verdad, en vez de dar una respuesta genérica: esa es la diferencia entre una foto y una conversación.',
  questionSentTitle: 'Pregunta enviada',
  questionSentBody:
    'Tu maestro o maestra la verá. Puedes enviar otra si se te ocurre alguna.',
  questionErrorTitle: 'Eso no se envió',
  questionErrorBody: 'Escribe tu nombre, y que la pregunta tenga al menos una oración completa.',
  firstNameLabel: 'Tu nombre',
  questionLabel: 'Tu pregunta',
  questionHint:
    'Las preguntas específicas reciben respuestas reales. «¿Cuál es un voto que te costó decidir?» funciona mejor que «¿Cómo es estar en el Congreso?».',
  submitQuestion: 'Enviar pregunta',
  chosenHeading: 'Preguntas que eligió tu maestro o maestra',

  civicsHeading: 'A dónde vas exactamente',
  civics: [
    {
      term: 'El edificio',
      description:
        'El Capitolio alberga las dos cámaras del Congreso: la Cámara de Representantes en el ala sur y el Senado en el ala norte. La cúpula y la Rotonda están entre ambas. Está en uso desde 1800, y ha sido reconstruido y ampliado varias veces desde entonces.',
    },
    {
      term: 'La Cámara de Representantes',
      description:
        '435 miembros con derecho a voto, cada uno representa un distrito de unas 760,000 personas, y todos se eligen cada dos años. El tuyo es uno de ellos. Como los distritos se trazan por población, un miembro de una ciudad densa representa a la misma cantidad de personas que uno de un distrito rural enorme.',
    },
    {
      term: 'El Senado',
      description:
        '100 miembros, dos por estado sin importar la población, elegidos por seis años, y cada dos años se renueva un tercio de los escaños. Wyoming y California tienen dos cada uno.',
    },
    {
      term: 'Qué hace realmente tu representante',
      description:
        'Mucho menos votar en el pleno de lo que la gente imagina. La mayor parte del trabajo es en comités, atender casos de los constituyentes —ayudar a la gente del distrito con las agencias federales— y reuniones. La visita que vas a hacer es en sí misma un servicio al constituyente.',
    },
    {
      term: 'Por qué el pleno suele estar casi vacío',
      description:
        'Los miembros normalmente están en audiencias de comités, en reuniones o en sus oficinas, y van al pleno para votar. Que la sala esté casi vacía durante un discurso es normal, no una señal de que a nadie le importe.',
    },
  ],
};

export const STUDENT_COPY: Translations<StudentCopy> = { en, es };
