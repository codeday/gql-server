import fs from 'fs';
import path from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { execute, parse } from 'graphql';
import { transformedSchemas } from '../../schema';
import { oldClears, oldLabs } from '../_historicalStats';

const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

const DOLLARS_PER_JOB = 4000000;
const DOLLARS_PER_JOB_COMPARE = 5400000;
const DOLLARS_PER_INCOME_POINT = DOLLARS_PER_JOB / 35;
const DOLLARS_PER_INCOME_POINT_COMPARE = DOLLARS_PER_JOB_COMPARE / 35;
const TTL_MS = 60 * 60 * 1000;

const STAT_OUTCOMES_FIELDS = `
  studentCount
  volunteerCount
  projectCount
  prCount
  studentHours
  volunteerHours
  hours
`;

const statOutcomesQuery = (fields) => parse(`
  query {
    statOutcomes { ${fields} }
    statOutcomesByYear {
      year
      statOutcomes { ${fields} }
    }
  }
`);

const STAT_OUTCOMES_QUERY = statOutcomesQuery(STAT_OUTCOMES_FIELDS);
// clear-gql is getting an `eventCount` field on StatOutcomes; labs-gql is not, so this is
// requested separately to avoid breaking the labs query in the meantime.
const CLEAR_STAT_OUTCOMES_QUERY = statOutcomesQuery(`${STAT_OUTCOMES_FIELDS}\n  eventCount`);

async function fetchStatOutcomes(name, document = STAT_OUTCOMES_QUERY) {
  const { schema } = transformedSchemas[name];
  const result = await execute({ schema, document });
  if (result.errors?.length) throw result.errors[0];
  return result.data;
}

function sumOutcomes(outcomesList) {
  const total = outcomesList.reduce((acc, o) => ({
    studentCount: acc.studentCount + (o.studentCount || 0),
    volunteerCount: acc.volunteerCount + (o.volunteerCount || 0),
    projectCount: acc.projectCount + (o.projectCount || 0),
    prCount: acc.prCount + (o.prCount || 0),
    studentHours: acc.studentHours + (o.studentHours || 0),
    volunteerHours: acc.volunteerHours + (o.volunteerHours || 0),
    eventCount: acc.eventCount + (o.eventCount || 0),
  }), {
    studentCount: 0,
    volunteerCount: 0,
    projectCount: 0,
    prCount: 0,
    studentHours: 0,
    volunteerHours: 0,
    eventCount: 0,
  });

  return { ...total, hours: total.studentHours + total.volunteerHours };
}

function mergeByYear(liveByYear, historical) {
  const byYear = { ...historical };
  liveByYear.forEach(({ year, statOutcomes }) => { byYear[year] = statOutcomes; });
  return byYear;
}

// Clear: the "compare" values size the whole student population against the lifetime earnings
// gain of a technical career ($5.4M), as a counterfactual baseline. The non-compare values
// instead use only students who continued past the low-interest-loan threshold, valued at $4M
// and scaled by a 0.17 attribution rate. economicToDate(Compare) only counts years once
// students have had time to start that career (4-year ramp-up).
function computeClearEconomics(liveByYear) {
  const currentYear = new Date().getFullYear();
  const byYear = mergeByYear(liveByYear, oldClears);

  let economicEstimatedCompare = 0;
  let economicEstimated = 0;
  let economicToDateCompare = 0;
  let economicToDate = 0;
  Object.entries(byYear).forEach(([year, stats]) => {
    economicEstimatedCompare += (stats.studentCount || 0) * DOLLARS_PER_JOB_COMPARE;
    economicEstimated += (stats.lowInterestContinuedCount || 0) * DOLLARS_PER_JOB * 0.17;

    const yearsRealized = Math.max(0, (currentYear - Number(year)) - 4);
    economicToDateCompare += yearsRealized * DOLLARS_PER_INCOME_POINT_COMPARE * (stats.studentCount || 0);
    economicToDate += yearsRealized * DOLLARS_PER_INCOME_POINT * (stats.lowInterestContinuedCount || 0) * 0.17;
  });

  return {
    economicEstimatedCompare,
    economicEstimated,
    economicToDateCompare,
    economicToDate,
  };
}

// Labs: every student is valued at the lifetime earnings gain of a technical career (compare
// uses $5.4M as a counterfactual baseline, non-compare uses $4M). economicToDate ramps up
// starting the year they attend, since Labs students are already career-track (no ramp-up
// delay, unlike Clear).
function computeLabsEconomics(liveByYear) {
  const currentYear = new Date().getFullYear();
  const byYear = mergeByYear(liveByYear, oldLabs);

  let economicEstimatedCompare = 0;
  let economicEstimated = 0;
  let economicToDateCompare = 0;
  let economicToDate = 0;
  Object.entries(byYear).forEach(([year, stats]) => {
    const studentCount = stats.studentCount || 0;
    economicEstimatedCompare += studentCount * DOLLARS_PER_JOB_COMPARE;
    economicEstimated += studentCount * DOLLARS_PER_JOB * 0.265;

    const yearsRealized = Math.max(0, currentYear - Number(year));
    economicToDateCompare += yearsRealized * DOLLARS_PER_INCOME_POINT_COMPARE * studentCount;
    economicToDate += yearsRealized * DOLLARS_PER_INCOME_POINT * studentCount * 0.265;
  });

  return {
    economicEstimatedCompare,
    economicEstimated,
    economicToDateCompare,
    economicToDate,
  };
}

async function computeImpact() {
  const [clearData, labsData] = await Promise.all([
    fetchStatOutcomes('clear', CLEAR_STAT_OUTCOMES_QUERY),
    fetchStatOutcomes('labs'),
  ]);

  const clearOutcomes = sumOutcomes([clearData.statOutcomes, ...Object.values(oldClears)]);
  const labsOutcomes = sumOutcomes([labsData.statOutcomes, ...Object.values(oldLabs)]);
  const totalOutcomes = sumOutcomes([clearOutcomes, labsOutcomes]);

  const clearEconomics = computeClearEconomics(clearData.statOutcomesByYear);
  const labsEconomics = computeLabsEconomics(labsData.statOutcomesByYear);

  return {
    ...totalOutcomes,
    studentLowIncomeCount: Math.round((clearOutcomes.studentCount * 0.68) + (labsOutcomes.studentCount * 0.87)),
    economicToDate: Math.round(clearEconomics.economicToDate + labsEconomics.economicToDate),
    economicToDateCompare: Math.round(clearEconomics.economicToDateCompare + labsEconomics.economicToDateCompare),
    economicEstimated: Math.round(clearEconomics.economicEstimated + labsEconomics.economicEstimated),
    economicEstimatedCompare: Math.round(
      clearEconomics.economicEstimatedCompare + labsEconomics.economicEstimatedCompare
    ),
  };
}

let cachedAt = 0;
let cachedPromise = null;
function getImpact() {
  if (!cachedPromise || Date.now() - cachedAt > TTL_MS) {
    cachedAt = Date.now();
    cachedPromise = computeImpact().catch((err) => { cachedPromise = null; throw err; });
  }
  return cachedPromise;
}

export default function createImpactSchema() {
  const resolvers = {
    Query: {
      studentCount: async () => (await getImpact()).studentCount,
      studentLowIncomeCount: async () => (await getImpact()).studentLowIncomeCount,
      volunteerCount: async () => (await getImpact()).volunteerCount,
      eventCount: async () => (await getImpact()).eventCount,
      projectCount: async () => (await getImpact()).projectCount,
      prCount: async () => (await getImpact()).prCount,
      studentHours: async () => (await getImpact()).studentHours,
      volunteerHours: async () => (await getImpact()).volunteerHours,
      hours: async () => (await getImpact()).hours,
      economicToDate: async () => (await getImpact()).economicToDate,
      economicToDateCompare: async () => (await getImpact()).economicToDateCompare,
      economicEstimated: async () => (await getImpact()).economicEstimated,
      economicEstimatedCompare: async () => (await getImpact()).economicEstimatedCompare,
    },
  };

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  return {
    schema,
  };
}
