import { DEFAULT_UNIT, DailyException, DailyReport, Member, RANKS } from './types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatKoreanDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return `${parsed.getMonth() + 1}.${parsed.getDate()}(${WEEKDAYS[parsed.getDay()]})`;
}

function compareMembers(a: Member, b: Member) {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  const rankDiff = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name, 'ko');
}

export function sortMembers(members: Member[]) {
  return [...members].sort(compareMembers);
}

export function displayMember(member: Pick<Member, 'rank' | 'name'>) {
  return `${member.rank} ${member.name}`;
}

function valueOrNone(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '없음';
}

export function emptyDailyReport(date: string): DailyReport {
  return {
    date,
    assault: '없음',
    verbal_abuse: '없음',
    sexual_misconduct: '없음',
    suicide_risk: '없음',
    complaints: '없음',
    patient: '없음',
    next_day_work: '',
  };
}

export function generateReportText(
  date: string,
  members: Member[],
  exceptions: DailyException[],
  dailyReport?: DailyReport | null,
) {
  const activeMembers = sortMembers(members.filter((member) => member.active));
  const exceptionMemberIds = new Set(exceptions.map((item) => item.member_id));
  const presentMembers = activeMembers.filter((member) => !exceptionMemberIds.has(member.id));
  const exceptionMemberMap = new Map(activeMembers.map((member) => [member.id, member]));
  const grouped = new Map<string, DailyException[]>();

  for (const exception of exceptions) {
    const list = grouped.get(exception.category) ?? [];
    list.push(exception);
    grouped.set(exception.category, list);
  }

  const exceptionLines: string[] = [];
  if (exceptions.length === 0) {
    exceptionLines.push('- 없음');
  } else {
    for (const [category, items] of grouped.entries()) {
      const sortedItems = [...items].sort((a, b) => {
        const memberA = exceptionMemberMap.get(a.member_id) ?? a.members;
        const memberB = exceptionMemberMap.get(b.member_id) ?? b.members;
        if (!memberA || !memberB) return 0;
        return compareMembers(memberA, memberB);
      });
      const membersInCategory = sortedItems
        .map((item) => exceptionMemberMap.get(item.member_id) ?? item.members)
        .filter((member): member is Member => Boolean(member));
      exceptionLines.push(`- ${category} ${membersInCategory.length} (${membersInCategory.map(displayMember).join(', ')})`);
      for (const item of sortedItems) {
        const member = exceptionMemberMap.get(item.member_id) ?? item.members;
        if (!member) continue;
        const reason = item.reason?.trim() || category;
        exceptionLines.push(`${displayMember(member)} (${reason})`);
      }
      exceptionLines.push('');
    }
    if (exceptionLines.at(-1) === '') exceptionLines.pop();
  }

  const report = dailyReport ?? emptyDailyReport(date);
  const unit = activeMembers[0]?.unit || DEFAULT_UNIT;

  return [
    `${formatKoreanDate(date)} ${unit}`,
    '',
    `총원 : ${activeMembers.length}`,
    '',
    `열외 : ${exceptions.length}`,
    '',
    `현재원 : ${presentMembers.length}(${presentMembers.map(displayMember).join(', ')})`,
    '',
    '열외내용 :',
    ...exceptionLines,
    '',
    '',
    '1. 병영생활 행동강령 위반사항',
    `- 구타 및 가혹행위 : ${valueOrNone(report.assault)}`,
    `- 언어폭력 : ${valueOrNone(report.verbal_abuse)}`,
    `- 성군기위반행위 : ${valueOrNone(report.sexual_misconduct)}`,
    `- 자살징후 : ${valueOrNone(report.suicide_risk)}`,
    '',
    '2. 애로 및 건의사항',
    `  - ${valueOrNone(report.complaints)}`,
    '',
    '3. 기타사항',
    `  - 환자: ${valueOrNone(report.patient)}`,
    `  - 익일 처부일과: ${valueOrNone(report.next_day_work)}`,
  ].join('\n');
}
