/**
 * 2015-16 风格的球队轮换锚点。
 *
 * 这些值不是“历史录像锁死器”，而是赛前计划：
 * 伤病、主角加入、犯规、垃圾时间、季后赛都会由 RotationPlanBuilder 重新分配。
 * 未列球队继续使用通用总评/耐力算法。
 */
export interface TeamRotationProfile {
  teamId: string;
  regularMinutes?: Record<string, number>;
  rotationDepth: number;
  benchTrust: number;
  starLoad: number;
  smallBallAffinity: number;
  playoffShortening: number;
  closingPriority?: Record<string, number>;
  staggerGroups?: string[][];
}

const profile = (
  teamId: string,
  config: Omit<TeamRotationProfile, 'teamId'>,
): TeamRotationProfile => ({ teamId, ...config });

export const TEAM_ROTATION_PROFILES: Record<string, TeamRotationProfile> = {
  GSW: profile('GSW', {
    regularMinutes: {
      'Stephen Curry': 34.2, 'Klay Thompson': 33.3, 'Draymond Green': 34.7,
      'Harrison Barnes': 30.9, 'Andre Iguodala': 26.6, 'Andrew Bogut': 20.7,
      'Shaun Livingston': 19.5, 'Festus Ezeli': 16.7, 'Marreese Speights': 11.6,
      'Leandro Barbosa': 15.9, 'Brandon Rush': 14.7,
    },
    rotationDepth: 10, benchTrust: 86, starLoad: 72, smallBallAffinity: 96, playoffShortening: .22,
    closingPriority: {
      'Stephen Curry': 100, 'Klay Thompson': 96, 'Draymond Green': 99,
      'Andre Iguodala': 94, 'Harrison Barnes': 84, 'Andrew Bogut': 45,
    },
    staggerGroups: [['Stephen Curry', 'Draymond Green']],
  }),
  CLE: profile('CLE', {
    regularMinutes: {
      'LeBron James': 35.6, 'Kyrie Irving': 31.5, 'Kevin Love': 31.5,
      'J.R. Smith': 30.7, 'Tristan Thompson': 27.7, 'Matthew Dellavedova': 24.6,
      'Iman Shumpert': 24.4, 'Timofey Mozgov': 17.4, 'Richard Jefferson': 17.9,
      'Mo Williams': 18.2,
    },
    rotationDepth: 9, benchTrust: 64, starLoad: 90, smallBallAffinity: 78, playoffShortening: .30,
    closingPriority: {
      'LeBron James': 100, 'Kyrie Irving': 97, 'Kevin Love': 90,
      'J.R. Smith': 87, 'Tristan Thompson': 88, 'Iman Shumpert': 76,
    },
    staggerGroups: [['LeBron James', 'Kyrie Irving']],
  }),
  SAS: profile('SAS', {
    regularMinutes: {
      'Kawhi Leonard': 33.1, 'LaMarcus Aldridge': 30.6, 'Tony Parker': 27.5,
      'Danny Green': 26.1, 'Tim Duncan': 25.2, 'Manu Ginobili': 19.6,
      'Patty Mills': 20.5, 'David West': 18.0, 'Boris Diaw': 18.2,
      'Kyle Anderson': 16.0,
    },
    rotationDepth: 11, benchTrust: 96, starLoad: 58, smallBallAffinity: 68, playoffShortening: .18,
    closingPriority: {
      'Kawhi Leonard': 100, 'LaMarcus Aldridge': 93, 'Danny Green': 85,
      'Tony Parker': 82, 'Manu Ginobili': 84, 'Tim Duncan': 80,
    },
  }),
  OKC: profile('OKC', {
    regularMinutes: {
      'Kevin Durant': 35.8, 'Russell Westbrook': 34.4, 'Serge Ibaka': 32.1,
      'Andre Roberson': 22.2, 'Steven Adams': 25.2, 'Enes Kanter': 21.0,
      'Dion Waiters': 27.6, 'Anthony Morrow': 13.6, 'D.J. Augustin': 15.3,
    },
    rotationDepth: 9, benchTrust: 60, starLoad: 94, smallBallAffinity: 64, playoffShortening: .30,
    closingPriority: {
      'Kevin Durant': 100, 'Russell Westbrook': 100, 'Serge Ibaka': 91,
      'Steven Adams': 82, 'Dion Waiters': 73, 'Andre Roberson': 76,
    },
  }),
  HOU: profile('HOU', {
    regularMinutes: {
      'James Harden': 38.1, 'Dwight Howard': 32.1, 'Trevor Ariza': 35.3,
      'Patrick Beverley': 28.7, 'Terrence Jones': 26.9, 'Corey Brewer': 20.4,
      'Clint Capela': 19.1, 'Jason Terry': 17.5, 'Ty Lawson': 29.5,
    },
    rotationDepth: 9, benchTrust: 56, starLoad: 96, smallBallAffinity: 82, playoffShortening: .26,
    closingPriority: {
      'James Harden': 100, 'Dwight Howard': 89, 'Trevor Ariza': 91,
      'Patrick Beverley': 86, 'Clint Capela': 74, 'Corey Brewer': 69,
    },
  }),
  LAC: profile('LAC', {
    regularMinutes: {
      'Chris Paul': 32.7, 'Blake Griffin': 33.4, 'DeAndre Jordan': 33.7,
      'J.J. Redick': 28.0, 'Jamal Crawford': 26.9, 'Paul Pierce': 18.1,
      'Austin Rivers': 21.9, 'Wesley Johnson': 20.8, 'Luc Mbah a Moute': 17.0,
    },
    rotationDepth: 9, benchTrust: 60, starLoad: 88, smallBallAffinity: 72, playoffShortening: .27,
    closingPriority: {
      'Chris Paul': 100, 'Blake Griffin': 96, 'DeAndre Jordan': 91,
      'J.J. Redick': 90, 'Jamal Crawford': 84, 'Luc Mbah a Moute': 72,
    },
  }),
  MEM: profile('MEM', {
    regularMinutes: {
      'Marc Gasol': 34.4, 'Mike Conley': 31.4, 'Zach Randolph': 29.6,
      'Jeff Green': 29.1, 'Tony Allen': 25.3, 'Courtney Lee': 29.2,
      'Matt Barnes': 28.8, 'Brandan Wright': 16.8, 'Vince Carter': 16.8,
    },
    rotationDepth: 9, benchTrust: 67, starLoad: 80, smallBallAffinity: 24, playoffShortening: .22,
    closingPriority: {
      'Marc Gasol': 100, 'Mike Conley': 98, 'Zach Randolph': 89,
      'Tony Allen': 90, 'Courtney Lee': 82, 'Matt Barnes': 78,
    },
  }),
  CHI: profile('CHI', {
    regularMinutes: {
      'Jimmy Butler': 36.9, 'Pau Gasol': 31.8, 'Derrick Rose': 31.8,
      'Nikola Mirotic': 24.9, 'Taj Gibson': 26.5, 'Joakim Noah': 21.9,
      'Doug McDermott': 23.0, 'Aaron Brooks': 16.1, 'E\'Twaun Moore': 21.4,
    },
    rotationDepth: 10, benchTrust: 71, starLoad: 88, smallBallAffinity: 56, playoffShortening: .22,
    closingPriority: {
      'Jimmy Butler': 100, 'Derrick Rose': 92, 'Pau Gasol': 89,
      'Taj Gibson': 82, 'Nikola Mirotic': 80, 'Joakim Noah': 76,
    },
  }),
  MIA: profile('MIA', {
    regularMinutes: {
      'Dwyane Wade': 30.5, 'Chris Bosh': 33.5, 'Hassan Whiteside': 29.1,
      'Goran Dragic': 32.8, 'Luol Deng': 32.4, 'Justise Winslow': 28.6,
      'Gerald Green': 22.6, 'Josh Richardson': 21.3, 'Tyler Johnson': 24.0,
    },
    rotationDepth: 9, benchTrust: 74, starLoad: 76, smallBallAffinity: 68, playoffShortening: .24,
    closingPriority: {
      'Dwyane Wade': 95, 'Chris Bosh': 95, 'Goran Dragic': 90,
      'Luol Deng': 85, 'Hassan Whiteside': 87, 'Justise Winslow': 82,
    },
  }),
  POR: profile('POR', {
    regularMinutes: {
      'Damian Lillard': 35.7, 'CJ McCollum': 34.8, 'Al-Farouq Aminu': 28.5,
      'Mason Plumlee': 25.4, 'Ed Davis': 20.8, 'Gerald Henderson': 19.9,
      'Allen Crabbe': 26.0, 'Moe Harkless': 18.7, 'Meyers Leonard': 21.9,
    },
    rotationDepth: 9, benchTrust: 69, starLoad: 89, smallBallAffinity: 72, playoffShortening: .26,
    closingPriority: {
      'Damian Lillard': 100, 'CJ McCollum': 97, 'Al-Farouq Aminu': 86,
      'Mason Plumlee': 77, 'Allen Crabbe': 81, 'Moe Harkless': 74,
    },
  }),
  LAL: profile('LAL', {
    regularMinutes: {
      'Kobe Bryant': 28.2, 'Jordan Clarkson': 32.3, 'Julius Randle': 28.2,
      'D\'Angelo Russell': 28.2, 'Lou Williams': 28.5, 'Roy Hibbert': 23.2,
      'Nick Young': 19.1, 'Brandon Bass': 20.3, 'Larry Nance Jr.': 20.1,
    },
    rotationDepth: 10, benchTrust: 72, starLoad: 62, smallBallAffinity: 58, playoffShortening: .12,
    closingPriority: {
      'Kobe Bryant': 92, 'Jordan Clarkson': 86, 'D\'Angelo Russell': 84,
      'Julius Randle': 82, 'Lou Williams': 83,
    },
  }),
  NYK: profile('NYK', {
    regularMinutes: {
      'Carmelo Anthony': 35.1, 'Kristaps Porzingis': 28.4, 'Robin Lopez': 27.1,
      'Arron Afflalo': 33.4, 'Jose Calderon': 28.1, 'Langston Galloway': 24.8,
      'Lance Thomas': 22.3, 'Derrick Williams': 17.9, 'Kyle O\'Quinn': 11.8,
      'Jerian Grant': 16.6,
    },
    rotationDepth: 10, benchTrust: 68, starLoad: 84, smallBallAffinity: 50, playoffShortening: .18,
    closingPriority: {
      'Carmelo Anthony': 100, 'Kristaps Porzingis': 90, 'Arron Afflalo': 84,
      'Robin Lopez': 78, 'Langston Galloway': 76, 'Jose Calderon': 72,
    },
  }),
};

export function getTeamRotationProfile(teamId: string): TeamRotationProfile | null {
  return TEAM_ROTATION_PROFILES[teamId] ?? null;
}
