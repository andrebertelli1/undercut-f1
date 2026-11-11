import type { RaceEvent } from '../lib/raceTypes.ts';

const COMPOUNDS: Record<string, string> = {
  SOFT: 'Macio',
  MEDIUM: 'Médio',
  HARD: 'Duro',
  INTERMEDIATE: 'Intermediário',
  WET: 'Chuva',
};

/** Motivos mais comuns do controle de prova; os demais aparecem como vieram. */
const REASONS: Record<string, string> = {
  'CAUSING A COLLISION': 'causar colisão',
  'LEAVING THE TRACK AND GAINING AN ADVANTAGE': 'sair da pista e ganhar vantagem',
  'FALSE START': 'queima de largada',
  'FALSE START - OUT OF POSITION': 'largada fora da posição',
  'UNSAFE RELEASE': 'liberação insegura no pit',
  'REJOINING UNSAFELY': 'retorno inseguro à pista',
  'YELLOW FLAG INFRINGEMENT': 'infração sob bandeira amarela',
  'FORCING ANOTHER DRIVER OFF THE TRACK': 'forçar outro piloto para fora da pista',
  'SPEEDING IN THE PIT LANE': 'excesso de velocidade no pit lane',
  'TRACK LIMITS': 'limites de pista',
  'MOVING UNDER BRAKING': 'mudar de direção na freada',
  'SAFETY CAR INFRINGEMENT': 'infração sob safety car',
};

const reason = (r?: string) => (r ? ` (${REASONS[r] ?? r.toLowerCase()})` : '');

export const ptBR = {
  locale: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  timeZoneLabel: 'Brasília',

  appName: 'Undercut',
  season: (y: number) => `Temporada ${y}`,
  loading: 'Carregando a temporada',
  loadError: 'Não deu para carregar os dados da temporada.',
  retry: 'Tentar de novo',
  disclaimer:
    'Site não oficial, sem vínculo com a Fórmula 1, a FIA ou as equipes. Dados: Jolpica e OpenF1.',
  updatedAt: (when: string) => `Atualizado em ${when}`,

  nextRace: 'Próxima corrida',
  seasonOver: 'Temporada encerrada',
  inDays: (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`),

  drivers: 'Pilotos',
  constructors: 'Construtores',
  points: 'pts',
  point: 'pt',
  wins: (n: number) => (n === 1 ? '1 vitória' : `${n} vitórias`),
  leader: 'líder',

  titleFight: 'Disputa do título',
  isChampion: (name: string) => `${name} é campeão mundial`,
  leadsBy: (name: string, gap: number) =>
    gap === 0 ? `${name} lidera no desempate` : `${name} lidera por ${gap} ${gap === 1 ? 'ponto' : 'pontos'}`,
  notStarted: 'A temporada ainda não começou',
  pointsInPlay: (n: number) => `${n} pontos ainda em jogo`,
  canReach: (n: number) => `pode chegar a ${n}`,
  racesLeft: (n: number) => (n === 1 ? 'falta 1 corrida' : `faltam ${n} corridas`),

  evolution: 'Evolução dos pontos',
  whoCanWin: 'Quem ainda pode ser campeão',
  clinchedAt: (name: string, race: string) => `${name} garantiu o título no ${race}.`,
  stillAlive: (n: number) => (n === 1 ? '1 piloto na disputa' : `${n} pilotos na disputa`),
  behind: (n: number) => `−${n}`,
  andMore: (n: number) => (n === 1 ? 'e mais 1 piloto' : `e mais ${n} pilotos`),
  constructorsTitle: 'Título de construtores',
  teamChampion: (name: string) => `${name} é campeã de construtores.`,
  teamOpen: (n: number) => `${n} equipes ainda podem ser campeãs.`,

  calendar: 'Calendário',
  round: (n: number) => `Etapa ${n}`,
  sprint: 'Sprint',
  upcoming: 'A disputar',
  winner: 'Vencedor',
  podium: 'Pódio',
  pole: 'Largou em 1º',
  fastestLap: 'Volta mais rápida',
  sprintWinner: 'Vencedor da sprint',
  lap: (n: number) => `volta ${n}`,
  watchRace: 'Ver corrida',
  watchRaceSoon: 'Replay da corrida em breve',
  raceStart: 'Largada',
  close: 'Fechar',
  hiddenWhileRewound: 'Ainda não disputada neste ponto da temporada.',

  mapLabel: 'Mapa com as etapas da temporada',
  mapHint: 'Role para aproximar · arraste para mover',
  resetMap: 'Ver o mapa inteiro',
  latestRace: 'Última corrida',
  pickSeason: 'Escolher temporada',
  recentRaces: 'Corridas disputadas',
  racesDone: (n: number, total: number) => `${n} de ${total} corridas`,
  tie: 'empate',
  afterRoundOf: (n: number, total: number) => `Depois da etapa ${n} de ${total}`,
  trackHint: 'Role para aproximar · arraste para mover',
  resetZoom: 'Ver a pista inteira',
  legendDone: 'Disputada, na cor da equipe vencedora',
  zoomIn: 'Aproximar',
  zoomOut: 'Afastar',

  // Tela da corrida
  backToSeason: 'Temporada',
  loadingRace: 'Carregando a corrida',
  raceLoadError: 'O replay desta corrida ainda não está disponível.',
  showResult: 'Ver resultado',
  hideResult: 'Ocultar resultado',
  officialResult: 'Resultado oficial',
  trackLabel: 'Pista com a posição dos carros',
  positions: 'Posições',
  pit: 'PIT',
  out: 'OUT',
  leaderShort: 'Líder',
  lapsDown: (n: number) => (n === 1 ? '+1 volta' : `+${n} voltas`),
  compound: (c: string) => COMPOUNDS[c] ?? c,
  tyreAge: (n: number) => (n === 1 ? '1 volta de uso' : `${n} voltas de uso`),
  stopFollowing: 'Parar de seguir',
  position: 'Posição',
  gapToLeader: 'Para o líder',
  carAhead: 'Carro à frente',
  carBehind: 'Carro atrás',
  tyres: 'Pneus',
  lapRange: (from: number, to: number) => (from === to ? `volta ${from}` : `voltas ${from}–${to}`),
  lastLaps: 'Últimas voltas',
  lapN: (n: number) => `Volta ${n}`,
  lapShort: (n: number) => `V${n}`,
  bestLap: 'Melhor volta',
  raceFeed: 'Na corrida',
  feedEmpty: 'Os acontecimentos aparecem aqui conforme a corrida avança.',
  weather: (air: number, track: number, rain: boolean) =>
    `Ar ${air}° · Pista ${track}° · ${rain ? 'Chovendo' : 'Sem chuva'}`,

  tabs: {
    track: 'Pista',
    story: 'História',
    compare: 'Comparar',
    strategy: 'Estratégia',
    whatif: 'E se?',
    analytics: 'Análise',
  },
  lapsLeft: (n: number) => (n === 0 ? 'última volta' : n === 1 ? 'falta 1 volta' : `faltam ${n} voltas`),
  openInReplay: 'Abrir este momento no replay',

  // Sessões do fim de semana
  sessionName: (name: string): string =>
    ({
      'Practice 1': 'Treino 1',
      'Practice 2': 'Treino 2',
      'Practice 3': 'Treino 3',
      Qualifying: 'Classificação',
      'Sprint Qualifying': 'Classificação da sprint',
      Sprint: 'Sprint',
      Race: 'Corrida',
    })[name] ?? name,
  weekendReplays: 'Replays do fim de semana',
  minuteOf: (n: number, total: number) => `Minuto ${n}/${total}`,
  sessionWaiting: 'Antes da sessão',
  prevMinute: 'Minuto anterior',
  nextMinute: 'Próximo minuto',
  legendLeadTimed: 'Troca na ponta da tabela',
  finalOrder: 'Classificação da sessão',
  sprintResult: 'Resultado da sprint',
  keysHintTimed: 'Espaço: tocar/pausar · ← →: 10 s · Shift + ← →: minuto',
  sectorShort: (n: number) => `S${n}`,
  sectorRunning: 'agora',
  currentLap: (n: number) => `Volta ${n} · em andamento`,
  lastLapN: (n: number) => `Volta ${n} · completa`,
  legendPurple: 'melhor de todos',
  legendGreen: 'melhor pessoal',
  legendYellow: 'mais lento',
  estimatedPositions: 'Posição na pista estimada neste trecho',
  estimatedHelp:
    'A fonte de dados não tem o sinal de posição dos carros aqui. A posição na pista foi estimada pelos tempos de volta; a classificação e as distâncias continuam sendo as reais.',

  // Aba História
  storyTitle: 'A história da corrida',
  storyFilter: 'Filtrar por importância',
  storyLevel: { 3: 'Decisivos', 2: 'Principais', 1: 'Tudo' },
  storyLimited: 'Mostrando só o que aconteceu até o ponto que você já assistiu.',
  eventCategory: (kind: RaceEvent['kind']): string => {
    switch (kind) {
      case 'start':
        return 'Largada';
      case 'overtake':
        return 'Ultrapassagem';
      case 'lead':
        return 'Liderança';
      case 'pit':
        return 'Pit stop';
      case 'sc':
      case 'scEnding':
        return 'Safety car';
      case 'vsc':
      case 'vscEnding':
        return 'Safety car virtual';
      case 'yellow':
      case 'doubleYellow':
      case 'red':
      case 'green':
      case 'chequered':
        return 'Bandeira';
      case 'penalty':
        return 'Punição';
      case 'investigation':
      case 'noAction':
      case 'warning':
        return 'Comissários';
      case 'retired':
        return 'Abandono';
      case 'finalLaps':
        return 'Reta final';
      case 'phase':
        return 'Sessão';
      case 'finish':
        return 'Chegada';
    }
  },
  source: { official: 'oficial', timing: 'cronometragem', inferred: 'deduzido' },
  sourceHelp: {
    official: 'Mensagem do controle de prova.',
    timing: 'Registrado pela cronometragem da corrida.',
    inferred: 'Deduzido das trocas de posição; pode haver erro.',
  },

  // Aba Comparar
  compareTitle: 'Frente a frente',
  gapNow: 'Agora',
  aheadBy: (code: string, s: number) => `${code} à frente por ${s.toFixed(1)} s`,
  aheadShort: (code: string) => `${code} à frente`,
  gapTitle: (a: string, b: string) => `Distância entre ${a} e ${b}`,
  gapEmpty: 'Sem dados de distância entre os dois neste trecho.',
  sectorsTitle: 'Setores de uma volta',
  sectorsEmpty: 'Sem tempos de setor para comparar.',
  sector: (n: number) => `Setor ${n}`,
  lapTotal: 'Volta',
  lapPick: 'Volta',
  difference: 'Diferença',
  deltaTitle: 'Diferença acumulada (s)',
  segmentGain: (code: string, s: number, from: number, to: number) =>
    `${code} ganha ${s.toFixed(3)} s entre ${from}% e ${to}% da volta`,

  // Aba Estratégia
  battlesTitle: 'Undercut e overcut',
  battlesHelp:
    'Posições trocadas pela ordem das paradas, entre pilotos que andavam juntos. Paradas com a corrida neutralizada ficam de fora.',
  battlesEmpty: 'Nenhuma troca de posição por parada identificada.',
  battleKind: { undercut: 'Undercut', overcut: 'Overcut' },
  battleText: (kind: 'undercut' | 'overcut', winner: string, loser: string, wLap: number, lLap: number) =>
    kind === 'undercut'
      ? `${winner} parou na volta ${wLap}, antes de ${loser} (volta ${lLap}), e saiu na frente`
      : `${winner} ficou na pista até a volta ${wLap}, depois de ${loser} (volta ${lLap}), e saiu na frente`,
  pitTableTitle: 'Pit stops',
  pitTableEmpty: 'Nenhuma parada até aqui.',
  lapHeader: 'Volta',
  lapsHeader: 'Voltas',
  driverHeader: 'Piloto',
  tyreChange: 'Pneus',
  pitLaneTime: 'No pit lane',
  positionChange: 'Posição',
  underCaution: 'neutralizada',
  lapsCount: (n: number) => (n === 1 ? '1 volta' : `${n} voltas`),

  // Aba E se?
  whatIfTitle: 'E se a parada fosse em outra volta?',
  whatIfIntro:
    'Escolha um piloto, mova uma parada dele e veja o efeito estimado no tempo de prova e na posição final.',
  whatIfLocked: 'A simulação usa a corrida inteira, então mostra o resultado.',
  whatIfNoStop: (code: string) => `${code} não fez nenhuma parada com troca de pneus registrada.`,
  whatIfError: {
    noStop: 'Este piloto não tem essa parada.',
    range: 'Escolha uma volta dentro da faixa possível para essa parada.',
    noModel: 'Não há voltas limpas suficientes para estimar o ritmo com esses pneus.',
    notFinished: 'Este piloto não terminou a corrida, então não há tempo final para comparar.',
    wet: 'Esta parada envolve pneus de chuva. Com a pista molhada ou secando, o ritmo muda de volta para volta por causa da pista, não do pneu, e a estimativa não seria confiável.',
  },
  whichStop: 'Qual parada',
  stopN: (n: number, lap: number) => `${n}ª parada (volta ${lap})`,
  stopAtLap: 'Parar ao fim da volta',
  realWas: (lap: number) => `na corrida foi na ${lap}`,
  nextTyre: 'Pneu seguinte',
  sameTyre: (name: string) => `O mesmo (${name})`,
  estimateFlag: 'Estimativa — não é resultado oficial',
  timeEffect: 'Efeito no tempo de prova',
  timeDelta: (s: number, faster: boolean) => `${s.toFixed(1)} s ${faster ? 'mais rápido' : 'mais lento'}`,
  noChange: 'Sem diferença',
  finishPosition: 'Posição de chegada',
  samePosition: 'A posição não mudaria.',
  realVsEstimated: 'Real → estimada',
  realLabel: 'Real',
  simulatedLabel: 'Simulada',
  assumptionsTitle: 'Premissas desta estimativa',
  modelLine: (deg: number, laps: number) =>
    `perde ${deg.toFixed(3)} s por volta de uso (medido em ${laps} voltas limpas de todo o pelotão)`,
  assumeAffected: (from: number, to: number) =>
    `Só as voltas ${from} a ${to} mudam; o resto da corrida fica como foi.`,
  assumeEvolution: (gain: number) =>
    `A cada volta de corrida os carros ficam ${gain.toFixed(3)} s mais rápidos (menos combustível, pista melhor), medido nesta corrida. O desgaste acima já desconta isso.`,
  assumePace: (code: string) => `O ritmo de ${code} é o que ele mostrou nas próprias voltas limpas.`,
  assumeIgnored:
    'Não entram na conta: tráfego, disputas de posição, safety car, erros, mudanças do tempo e a pista ficando mais rápida ao longo da corrida. O tempo perdido no pit é o mesmo da parada real.',
  whatIfWarning: {
    fewLaps: 'Poucas voltas limpas com um destes pneus nesta corrida: o desgaste estimado é menos confiável.',
    neutralised: 'A parada real foi com a corrida neutralizada, quando parar custa menos. Movê-la mudaria esse custo, e isso não está na conta.',
    lapped: 'O piloto terminou com voltas a menos; a posição estimada compara só com quem terminou na mesma volta.',
  },

  // Aba Análise
  lapChartTitle: 'Posições volta a volta',
  bestLapsTitle: 'Melhores voltas',
  stintPaceTitle: (code: string) => `Ritmo por stint · ${code}`,
  averageLap: 'Média',
  degradation: 'Desgaste',
  degradationHelp: 'Quanto a volta piora a cada volta de uso do pneu, já descontado o combustível.',
  perLap: (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(3)} s/volta`,
  cleanLapsNote: 'Só voltas limpas: sem a primeira volta, pits, neutralizações e voltas muito lentas.',
  consistencyTitle: 'Consistência',
  consistencyHelp: 'Ordenado pelo ritmo mediano. A variação mostra quão constante cada piloto foi nas voltas limpas.',
  medianLap: 'Ritmo mediano',
  spread: 'Variação',
  cleanLapsHeader: 'Voltas limpas',

  tabTrack: 'Pista',
  tabStrategy: 'Estratégia',
  raceTabs: 'Visões da corrida',
  strategyLimited: (lap: number) =>
    `Mostrando só até a volta ${lap}, o ponto mais adiantado que você já assistiu.`,
  stintsTitle: 'Pneus de cada piloto',
  paceTitle: 'Ritmo volta a volta',
  paceEmpty: 'Ainda não há voltas completas para comparar.',
  driverA: 'Piloto A',
  driverB: 'Piloto B',
  telemetryTitle: 'Melhor volta de cada um, lado a lado',
  telemetryLocked: 'A melhor volta de cada piloto só é conhecida no fim da corrida.',
  telemetryMissing: 'Sem telemetria para esta comparação.',
  telemetryAxis: 'Da linha de chegada (esquerda) até completar a volta (direita).',
  speedKmh: 'km/h',
  throttle: 'Acelerador',
  brake: 'Freio',

  player: 'Player da corrida',
  play: 'Tocar',
  pause: 'Pausar',
  prevLap: 'Volta anterior',
  nextLap: 'Próxima volta',
  speed: 'Velocidade',
  raceProgress: 'Progresso da corrida',
  startingGrid: 'Grid de largada',
  lapOf: (n: number, total: number) => `Volta ${n}/${total}`,
  legendLead: 'Troca de líder',
  legendPit: 'Pit dos três primeiros',
  keysHint: 'Espaço: tocar/pausar · ← →: 10 s · Shift + ← →: volta',
  trackStatus: {
    grid: 'Grid',
    green: 'Bandeira verde',
    sc: 'Safety car',
    vsc: 'Safety car virtual',
    red: 'Bandeira vermelha',
    chequered: 'Bandeira quadriculada',
  },
  eventText: (e: RaceEvent, code: (n: number) => string): string => {
    const who = (e.drivers ?? []).map(code).join(' e ');
    switch (e.kind) {
      case 'start':
        return 'Largada';
      case 'yellow':
        return `Bandeira amarela no setor ${e.n}`;
      case 'doubleYellow':
        return `Bandeira amarela dupla no setor ${e.n}`;
      case 'sc':
        return 'Safety car na pista';
      case 'scEnding':
        return 'Safety car entra nesta volta';
      case 'vsc':
        return 'Safety car virtual acionado';
      case 'vscEnding':
        return 'Safety car virtual terminando';
      case 'red':
        return 'Bandeira vermelha: sessão interrompida';
      case 'green':
        return 'Bandeira verde: pista liberada';
      case 'chequered':
        return 'Bandeira quadriculada';
      case 'penalty':
        return `Punição${e.n ? ` de ${e.n} s` : ''} para ${who}${reason(e.reason)}`;
      case 'investigation':
        return `${who} sob investigação${reason(e.reason)}`;
      case 'noAction':
        return `Sem punição para ${who}${reason(e.reason)}`;
      case 'warning':
        return `Advertência para ${who}${reason(e.reason)}`;
      case 'pit':
        return `${who} no pit${e.n ? ` (${e.n.toFixed(1)} s no pit lane)` : ''}`;
      case 'lead':
        return `${who} assume a liderança`;
      case 'retired':
        return `${who} abandona`;
      case 'overtake': {
        const [a, b] = (e.drivers ?? []).map(code);
        return e.n === 1
          ? `${a} ultrapassa ${b} e assume a liderança`
          : `${a} ultrapassa ${b} pelo ${e.n}º lugar`;
      }
      case 'finalLaps':
        return `Últimas ${e.n} voltas`;
      case 'phase':
        return `Começa o ${e.reason}`;
      case 'finish':
        return `${who} recebe a bandeirada em primeiro`;
    }
  },

  timeline: 'Linha do tempo da temporada',
  afterRound: (n: number, name: string) => `Depois da etapa ${n} · ${name}`,
  beforeSeason: 'Antes da primeira etapa',
  now: 'Atual',
  teammates: 'Duelo interno',
};

export type Dict = typeof ptBR;

/** Nomes das corridas em português, a partir do nome que vem da Jolpica. */
export const raceNamesPtBR: Record<string, string> = {
  'Australian Grand Prix': 'GP da Austrália',
  'Chinese Grand Prix': 'GP da China',
  'Japanese Grand Prix': 'GP do Japão',
  'Bahrain Grand Prix': 'GP do Bahrein',
  'Saudi Arabian Grand Prix': 'GP da Arábia Saudita',
  'Miami Grand Prix': 'GP de Miami',
  'Canadian Grand Prix': 'GP do Canadá',
  'Monaco Grand Prix': 'GP de Mônaco',
  'Barcelona Grand Prix': 'GP de Barcelona',
  'Austrian Grand Prix': 'GP da Áustria',
  'British Grand Prix': 'GP da Grã-Bretanha',
  'Belgian Grand Prix': 'GP da Bélgica',
  'Hungarian Grand Prix': 'GP da Hungria',
  'Dutch Grand Prix': 'GP da Holanda',
  'Italian Grand Prix': 'GP da Itália',
  'Spanish Grand Prix': 'GP da Espanha',
  'Azerbaijan Grand Prix': 'GP do Azerbaijão',
  'Bahrain Grand Prix in Malaysia': 'GP do Bahrein na Malásia',
  'Singapore Grand Prix': 'GP de Singapura',
  'United States Grand Prix': 'GP dos Estados Unidos',
  'Mexico City Grand Prix': 'GP da Cidade do México',
  'Brazilian Grand Prix': 'GP do Brasil',
  'São Paulo Grand Prix': 'GP de São Paulo',
  'Las Vegas Grand Prix': 'GP de Las Vegas',
  'Qatar Grand Prix': 'GP do Catar',
  'Abu Dhabi Grand Prix': 'GP de Abu Dhabi',
};
