export type Rank = '병장' | '상병' | '일병' | '이병';

export type Member = {
  id: string;
  name: string;
  rank: Rank;
  unit: string;
  active: boolean;
  sort_order: number;
  created_at?: string;
};

export type ExceptionCategory = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at?: string;
};

export type DailyException = {
  id: string;
  date: string;
  member_id: string;
  category: string;
  reason: string | null;
  created_at?: string;
  members?: Member;
};

export type DailyReport = {
  id?: string;
  date: string;
  assault: string;
  verbal_abuse: string;
  sexual_misconduct: string;
  suicide_risk: string;
  complaints: string;
  patient: string;
  next_day_work: string | null;
  created_at?: string;
};

export const RANKS: Rank[] = ['병장', '상병', '일병', '이병'];
export const OTHER_EXCEPTION_CATEGORY = '기타';
export const DEFAULT_EXCEPTION_CATEGORIES = ['외출', '외박', '휴가', '전투휴무', '외진', '식청', OTHER_EXCEPTION_CATEGORY];
export const DEFAULT_UNIT = '전투지원소대 수송분대';
export const ADMIN_ID = 'tnthd';
export const ADMIN_PASSWORD = '1q2w3e4r!';
