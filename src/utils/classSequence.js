function normalizeClassName(name) {
  return String(name || '').trim().toLowerCase();
}

function getSchoolRank(name) {
  const n = normalizeClassName(name);
  if (n.includes('pg') || n.includes('playgroup')) return 1;
  if (n.includes('nursery')) return 2;
  if (n.includes('prep') || n.includes('preparatory')) return 3;
  if (n.includes('one') || n === '1' || n === 'class one' || n === 'class 1') return 4;
  if (n.includes('two') || n === '2' || n === 'class two' || n === 'class 2') return 5;
  if (n.includes('three') || n === '3' || n === 'class three' || n === 'class 3') return 6;
  if (n.includes('four') || n === '4' || n === 'class four' || n === 'class 4') return 7;
  if (n.includes('five') || n === '5' || n === 'class five' || n === 'class 5') return 8;
  if (n.includes('6th') || n.includes('six') || n === '6' || n === 'class 6') return 9;
  if (n.includes('7th') || n.includes('seven') || n === '7' || n === 'class 7') return 10;
  if (n.includes('8th') || n.includes('eight') || n === '8' || n === 'class 8') return 11;
  if (n.includes('9th') || n.includes('nine') || n === '9' || n === 'class 9') return 12;
  if (n.includes('10th') || n.includes('ten') || n === '10' || n === 'class 10') return 13;
  return null;
}

function getCollegeRank(name) {
  const n = normalizeClassName(name);
  if (n.includes('1st year') || n.includes('first year') || n.includes('11th')) return 1;
  if (n.includes('2nd year') || n.includes('second year') || n.includes('12th')) return 2;
  return null;
}

function sortSchoolClasses(classes) {
  return [...classes]
    .map((c) => ({ ...c, __rank: getSchoolRank(c.name) }))
    .filter((c) => c.__rank !== null)
    .sort((a, b) => a.__rank - b.__rank || String(a.name).localeCompare(String(b.name)));
}

function sortCollegeClasses(classes) {
  return [...classes]
    .map((c) => ({ ...c, __rank: getCollegeRank(c.name) }))
    .filter((c) => c.__rank !== null)
    .sort((a, b) => a.__rank - b.__rank || String(a.name).localeCompare(String(b.name)));
}

module.exports = {
  getSchoolRank,
  getCollegeRank,
  sortSchoolClasses,
  sortCollegeClasses,
};
