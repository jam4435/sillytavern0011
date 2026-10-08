/**
 * 2015-16 历史轮换分钟基准。
 * 只能用于校准测试，生产运行时代码禁止导入。
 */
export const ROTATION_BENCHMARKS_2015_16: Record<string, Record<string, number>> = {
  GSW: {
    'Stephen Curry': 34.2, 'Klay Thompson': 33.3, 'Draymond Green': 34.7,
    'Harrison Barnes': 30.9, 'Andre Iguodala': 26.6, 'Andrew Bogut': 20.7,
    'Shaun Livingston': 19.5, 'Festus Ezeli': 16.7, 'Marreese Speights': 11.6,
  },
  CLE: {
    'LeBron James': 35.6, 'Kyrie Irving': 31.5, 'Kevin Love': 31.5,
    'J.R. Smith': 30.7, 'Tristan Thompson': 27.7, 'Matthew Dellavedova': 24.6,
    'Iman Shumpert': 24.4, 'Timofey Mozgov': 17.4, 'Richard Jefferson': 17.9,
  },
  SAS: {
    'Kawhi Leonard': 33.1, 'LaMarcus Aldridge': 30.6, 'Tony Parker': 27.5,
    'Danny Green': 26.1, 'Tim Duncan': 25.2, 'Manu Ginobili': 19.6,
    'Patty Mills': 20.5, 'David West': 18.0, 'Boris Diaw': 18.2,
  },
  HOU: {
    'James Harden': 38.1, 'Dwight Howard': 32.1, 'Trevor Ariza': 35.3,
    'Patrick Beverley': 28.7, 'Terrence Jones': 26.9, 'Corey Brewer': 20.4,
    'Clint Capela': 19.1, 'Jason Terry': 17.5,
  },
  MEM: {
    'Marc Gasol': 34.4, 'Mike Conley': 31.4, 'Zach Randolph': 29.6,
    'Jeff Green': 29.1, 'Tony Allen': 25.3, 'Courtney Lee': 29.2,
    'Matt Barnes': 28.8, 'Brandan Wright': 16.8, 'Vince Carter': 16.8,
  },
};
