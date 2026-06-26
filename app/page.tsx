'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { displayMember, emptyDailyReport, generateReportText, sortMembers, todayIso } from '@/lib/report';
import {
  ADMIN_ID,
  ADMIN_PASSWORD,
  DEFAULT_EXCEPTION_CATEGORIES,
  DEFAULT_UNIT,
  OTHER_EXCEPTION_CATEGORY,
  VACATION_CATEGORY,
  DailyException,
  DailyReport,
  ExceptionCategory,
  Member,
  Rank,
  RANKS,
  VacationSchedule,
} from '@/lib/types';

type Tab = 'exceptions' | 'daily' | 'report' | 'admin';
type ExceptionListScope = 'day' | 'month';
type Modal = 'login' | 'usage' | null;

const reportFields = [
  ['assault', '구타 및 가혹행위'],
  ['verbal_abuse', '언어폭력'],
  ['sexual_misconduct', '성군기위반행위'],
  ['suicide_risk', '자살징후'],
  ['complaints', '애로 및 건의사항'],
  ['patient', '환자'],
  ['next_day_work', '익일 처부일과'],
] as const;

const emptyMemberForm = { id: '', name: '', rank: '상병', unit: DEFAULT_UNIT, active: true, sort_order: 0 };
const emptyCategoryForm = { id: '', name: '', active: true, sort_order: 0 };
const emptyExceptionForm = { id: '', member_id: '', category: DEFAULT_EXCEPTION_CATEGORIES[0], customCategory: '', start_date: todayIso(), end_date: todayIso(), reason: '' };

const ADMIN_STORAGE_KEY = 'daily-report-admin';

function readAdminSession() {
  try {
    return window.localStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function monthStartIso(month: string) {
  return `${month}-01`;
}

function monthEndIso(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year, monthIndex, 0).toISOString().slice(0, 10);
}

function writeAdminSession(isAdmin: boolean) {
  try {
    if (isAdmin) {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  } catch {
    // In-app browsers can block localStorage. Keep the in-memory login state working.
  }
}

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [tab, setTab] = useState<Tab>('exceptions');
  const [modal, setModal] = useState<Modal>(null);
  const [date, setDate] = useState(todayIso());
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<ExceptionCategory[]>([]);
  const [exceptions, setExceptions] = useState<DailyException[]>([]);
  const [listedExceptions, setListedExceptions] = useState<DailyException[]>([]);
  const [dailyVacationSchedules, setDailyVacationSchedules] = useState<VacationSchedule[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport>(emptyDailyReport(todayIso()));
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [exceptionForm, setExceptionForm] = useState(emptyExceptionForm);
  const [exceptionListScope, setExceptionListScope] = useState<ExceptionListScope>('day');
  const [exceptionCategoryFilter, setExceptionCategoryFilter] = useState('전체');
  const [message, setMessage] = useState('');
  const exceptionFormRef = useRef<HTMLDivElement>(null);
  const exceptionListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsAdmin(readAdminSession());
    void refreshAll();
  }, []);

  useEffect(() => {
    setExceptionForm((form) => (form.id ? form : { ...form, start_date: date, end_date: date }));
    void Promise.all([fetchExceptionsByDate(date), fetchExceptionList(date, exceptionListScope), fetchVacationSchedulesByDate(date), fetchDailyReport(date)]).catch(showError);
  }, [date]);

  useEffect(() => {
    void fetchExceptionList(date, exceptionListScope).catch(showError);
  }, [exceptionListScope]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function fetchMembers() {
    const { data, error } = await supabase.from('members').select('*').order('sort_order').order('name');
    if (error) throw error;
    setMembers(sortMembers((data ?? []) as Member[]));
  }

  async function fetchCategories() {
    const { data, error } = await supabase.from('exception_categories').select('*').order('sort_order').order('name');
    if (error) throw error;
    const fetched = (data ?? []) as ExceptionCategory[];
    setCategories(fetched.length > 0 ? fetched : DEFAULT_EXCEPTION_CATEGORIES.map((name, index) => ({ id: name, name, active: true, sort_order: index })));
  }

  async function fetchExceptionsByDate(selectedDate: string) {
    const { data, error } = await supabase.from('daily_exceptions').select('*, members(*)').eq('date', selectedDate);
    if (error) throw error;
    setExceptions((data ?? []) as DailyException[]);
  }

  async function fetchExceptionList(selectedDate: string, scope: ExceptionListScope) {
    let query = supabase.from('daily_exceptions').select('*, members(*)').order('date').order('created_at');
    if (scope === 'day') {
      query = query.eq('date', selectedDate);
    } else {
      query = query.gte('date', monthStartIso(selectedDate.slice(0, 7))).lte('date', monthEndIso(selectedDate.slice(0, 7)));
    }
    const { data, error } = await query;
    if (error) throw error;
    setListedExceptions((data ?? []) as DailyException[]);
  }

  async function fetchVacationSchedulesByDate(selectedDate: string) {
    const { data, error } = await supabase
      .from('vacation_schedules')
      .select('*, members(*)')
      .lte('start_date', selectedDate)
      .gte('end_date', selectedDate)
      .order('start_date');
    if (error) throw error;
    setDailyVacationSchedules((data ?? []) as VacationSchedule[]);
  }

  async function fetchDailyReport(selectedDate: string) {
    const { data, error } = await supabase.from('daily_reports').select('*').eq('date', selectedDate).maybeSingle();
    if (error) throw error;
    setDailyReport(data ? (data as DailyReport) : emptyDailyReport(selectedDate));
  }

  async function refreshAll() {
    try {
      await Promise.all([fetchMembers(), fetchCategories(), fetchExceptionsByDate(date), fetchExceptionList(date, exceptionListScope), fetchVacationSchedulesByDate(date), fetchDailyReport(date)]);
    } catch (error) {
      showError(error);
    }
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
  }

  function scrollToSection(ref: React.RefObject<HTMLElement | null>) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function loginAdmin() {
    if (adminId.trim().toLowerCase() === ADMIN_ID && adminPassword === ADMIN_PASSWORD) {
      writeAdminSession(true);
      setIsAdmin(true);
      setAdminPassword('');
      setMessage('관리자 모드로 전환했습니다.');
      setModal(null);
      return;
    }
    setMessage('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  function logoutAdmin() {
    writeAdminSession(false);
    setIsAdmin(false);
    setTab('exceptions');
    setMessage('관리자 모드를 종료했습니다.');
  }

  async function saveMember() {
    if (!isAdmin) return setMessage('관리자 모드에서만 인원명부를 수정할 수 있습니다.');
    const payload = { ...memberForm, sort_order: Number(memberForm.sort_order) || 0 };
    const { id, ...savePayload } = payload;
    const query = id ? supabase.from('members').update(savePayload).eq('id', id) : supabase.from('members').insert(savePayload);
    const { error } = await query;
    setMessage(error ? error.message : '인원명부를 저장했습니다.');
    if (!error) {
      setMemberForm(emptyMemberForm);
      setShowMemberForm(false);
      await fetchMembers();
    }
  }

  async function deleteMember(id: string) {
    if (!isAdmin) return setMessage('관리자 모드에서만 인원명부를 수정할 수 있습니다.');
    const { error } = await supabase.from('members').delete().eq('id', id);
    setMessage(error ? error.message : '인원을 삭제했습니다.');
    if (!error) {
      if (memberForm.id === id) setMemberForm(emptyMemberForm);
      await fetchMembers();
    }
  }

  async function moveMember(member: Member, direction: -1 | 1) {
    if (!isAdmin) return setMessage('관리자 모드에서만 인원명부를 수정할 수 있습니다.');
    const orderedMembers = sortMembers(members);
    const index = orderedMembers.findIndex((item) => item.id === member.id);
    const target = orderedMembers[index + direction];
    if (!target) return;

    const reorderedMembers = [...orderedMembers];
    [reorderedMembers[index], reorderedMembers[index + direction]] = [reorderedMembers[index + direction], reorderedMembers[index]];
    const { error } = await supabase.from('members').upsert(
      reorderedMembers.map((item, sortOrder) => ({ ...item, sort_order: sortOrder })),
    );
    setMessage(error ? error.message : '인원 우선순위를 변경했습니다.');
    if (!error) await fetchMembers();
  }

  async function saveCategory() {
    if (!isAdmin) return setMessage('관리자 모드에서만 카테고리를 수정할 수 있습니다.');
    const payload = { ...categoryForm, sort_order: Number(categoryForm.sort_order) || 0 };
    const { id, ...savePayload } = payload;
    const query = id ? supabase.from('exception_categories').update(savePayload).eq('id', id) : supabase.from('exception_categories').insert(savePayload);
    const { error } = await query;
    setMessage(error ? error.message : '카테고리를 저장했습니다.');
    if (!error) {
      setCategoryForm(emptyCategoryForm);
      await fetchCategories();
    }
  }

  function dateRange(startDate: string, endDate: string) {
    const dates: string[] = [];
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  async function refreshExceptionData() {
    await Promise.all([fetchExceptionsByDate(date), fetchExceptionList(date, exceptionListScope), fetchVacationSchedulesByDate(date)]);
  }

  async function saveException() {
    const selectedCategory = exceptionForm.category === OTHER_EXCEPTION_CATEGORY ? exceptionForm.customCategory.trim() : exceptionForm.category;
    if (!selectedCategory) return setMessage('기타 카테고리를 선택한 경우 직접 입력값을 작성해야 합니다.');
    if (!exceptionForm.member_id) return setMessage('열외 인원을 선택해야 합니다.');
    if (exceptionForm.start_date > exceptionForm.end_date) return setMessage('시작일은 종료일보다 늦을 수 없습니다.');

    if (exceptionForm.id) {
      const payload = {
        date: exceptionForm.start_date,
        member_id: exceptionForm.member_id,
        category: selectedCategory,
        reason: exceptionForm.reason || null,
      };
      const { error } = await supabase.from('daily_exceptions').update(payload).eq('id', exceptionForm.id);
      setMessage(error ? error.message : '열외 정보를 수정했습니다.');
      if (!error) {
        setExceptionForm({ ...emptyExceptionForm, start_date: date, end_date: date, category: activeCategories[0] ?? DEFAULT_EXCEPTION_CATEGORIES[0] });
        await refreshExceptionData();
        scrollToSection(exceptionListRef);
      }
      return;
    }

    const payloads = dateRange(exceptionForm.start_date, exceptionForm.end_date).map((entryDate) => ({
      date: entryDate,
      member_id: exceptionForm.member_id,
      category: selectedCategory,
      reason: exceptionForm.reason || null,
    }));
    const { error } = await supabase.from('daily_exceptions').upsert(payloads, { onConflict: 'date,member_id' });
    setMessage(error ? error.message : `${payloads.length}일치 열외 정보를 저장했습니다.`);
    if (!error) {
      setExceptionForm({ ...emptyExceptionForm, start_date: date, end_date: date, category: activeCategories[0] ?? DEFAULT_EXCEPTION_CATEGORIES[0] });
      await refreshExceptionData();
      scrollToSection(exceptionListRef);
    }
  }

  function editException(exception: DailyException) {
    setExceptionForm({
      id: exception.id,
      member_id: exception.member_id,
      category: activeCategories.includes(exception.category) ? exception.category : OTHER_EXCEPTION_CATEGORY,
      customCategory: activeCategories.includes(exception.category) ? '' : exception.category,
      start_date: exception.date,
      end_date: exception.date,
      reason: exception.reason ?? '',
    });
    scrollToSection(exceptionFormRef);
  }

  async function deleteException(id: string) {
    const { error } = await supabase.from('daily_exceptions').delete().eq('id', id);
    setMessage(error ? error.message : '열외 정보를 삭제했습니다.');
    if (!error) {
      await refreshExceptionData();
      scrollToSection(exceptionListRef);
    }
  }

  async function upsertDailyReport() {
    const { error } = await supabase.from('daily_reports').upsert({ ...dailyReport, date }, { onConflict: 'date' });
    setMessage(error ? error.message : '일일 보고사항을 저장했습니다.');
    if (!error) await fetchDailyReport(date);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage('보고문을 클립보드에 복사했습니다.');
  }

  const activeMembers = useMemo(() => sortMembers(members.filter((member) => member.active)), [members]);
  const activeCategories = useMemo(() => {
    const list = categories.filter((category) => category.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ko')).map((category) => category.name);
    const source = list.length > 0 ? list : DEFAULT_EXCEPTION_CATEGORIES;
    const withVacation = source.includes(VACATION_CATEGORY) ? source : [...source, VACATION_CATEGORY];
    return withVacation.includes(OTHER_EXCEPTION_CATEGORY) ? withVacation : [...withVacation, OTHER_EXCEPTION_CATEGORY];
  }, [categories]);
  const reportExceptions = useMemo(() => {
    const manualExceptionMemberIds = new Set(exceptions.map((exception) => exception.member_id));
    const activeMemberIds = new Set(activeMembers.map((member) => member.id));
    const vacationExceptions: DailyException[] = dailyVacationSchedules
      .filter((schedule) => activeMemberIds.has(schedule.member_id) && !manualExceptionMemberIds.has(schedule.member_id))
      .map((schedule) => ({
        id: `vacation-${schedule.id}`,
        date,
        member_id: schedule.member_id,
        category: VACATION_CATEGORY,
        reason: schedule.reason,
        created_at: schedule.created_at,
        members: schedule.members,
      }));

    return [...exceptions, ...vacationExceptions];
  }, [date, exceptions, dailyVacationSchedules, activeMembers]);
  const filteredListedExceptions = useMemo(() => {
    return listedExceptions.filter((exception) => exceptionCategoryFilter === '전체' || exception.category === exceptionCategoryFilter);
  }, [listedExceptions, exceptionCategoryFilter]);
  const reportText = useMemo(() => generateReportText(date, members, reportExceptions, dailyReport), [date, members, reportExceptions, dailyReport]);

  return (
    <main className="container">
      <header className="header">
        <button className="secondary" onClick={() => setModal('login')}>{isAdmin ? '관리자 모드' : '로그인'}</button>
        <button className="secondary" onClick={() => setModal('usage')}>사용법</button>
      </header>

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`${modal}-modal-title`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <h2 id={`${modal}-modal-title`}>{modal === 'login' ? '관리자 로그인' : '사용법'}</h2>
              <button className="icon-button secondary" onClick={() => setModal(null)} aria-label="팝업 닫기">×</button>
            </div>
            {modal === 'login' ? (
              isAdmin ? (
                <div className="stack">
                  <p className="muted">현재 관리자 모드입니다. 인원명부와 카테고리를 수정할 수 있습니다.</p>
                  <button className="secondary" onClick={() => { logoutAdmin(); setModal(null); }}>관리자 종료</button>
                </div>
              ) : (
                <div className="stack">
                  <input aria-label="관리자 아이디" placeholder="관리자 ID" value={adminId} autoCapitalize="none" autoCorrect="off" autoComplete="username" inputMode="text" onChange={(event) => setAdminId(event.target.value)} />
                  <input aria-label="관리자 비밀번호" placeholder="비밀번호" type="password" value={adminPassword} autoCapitalize="none" autoCorrect="off" autoComplete="current-password" onChange={(event) => setAdminPassword(event.target.value)} />
                  <button onClick={loginAdmin}>관리자 로그인</button>
                </div>
              )
            ) : (
              <ol className="usage-list">
                <li>상단에서 보고 날짜를 선택합니다.</li>
                <li>열외 입력 탭에서 인원, 카테고리, 시작일, 종료일을 선택해 저장합니다.</li>
                <li>하루 열외는 시작일과 종료일을 같은 날짜로 두고, 휴가·외박처럼 여러 날이면 기간으로 입력합니다.</li>
                <li>휴가도 열외 인원에 포함되므로 카테고리에서 휴가를 선택해 함께 등록합니다.</li>
                <li>일일 보고사항 탭에서 특이사항을 입력합니다. 비어 있는 항목은 보고문에서 없음으로 표시됩니다.</li>
                <li>보고문 생성 탭에서 총원·열외·현재원과 열외내용을 확인한 뒤 복사합니다.</li>
                <li>인원명부나 카테고리 수정은 관리자 로그인 후 관리자 설정에서 진행합니다.</li>
              </ol>
            )}
          </section>
        </div>
      )}

      {!hasSupabaseConfig && <p className="card warning">Vercel 또는 .env.local에 Supabase 환경변수를 등록해야 실제 DB 저장이 작동합니다.</p>}
      <section className="card">
        <div className="grid">
          <label className="col-4">보고 날짜<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <div className="col-8 muted stat-line">총원 {activeMembers.length}명 · 열외 {reportExceptions.length}명 · 현재원 {activeMembers.length - reportExceptions.length}명</div>
        </div>
      </section>

      <nav className="tabs">
        {(['exceptions', 'daily', 'report', 'admin'] as Tab[]).map((item) => (
          <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
            {({ exceptions: '열외 입력', daily: '일일 보고사항', report: '보고문 생성', admin: '관리자 설정' } as Record<Tab, string>)[item]}
          </button>
        ))}
      </nav>
      {message && <div className="toast" role="status"><span>{message}</span><button className="toast-close" onClick={() => setMessage('')} aria-label="알림 닫기">×</button></div>}

      {tab === 'exceptions' && (
        <section className="grid">
          <div className="card col-5" ref={exceptionFormRef}>
            <h2>열외 입력</h2>
            <p className="muted">휴가를 포함한 모든 열외를 한 곳에서 입력합니다. 하루 또는 기간 단위로 저장할 수 있습니다.</p>
            <div className="stack">
              <label>이름<select value={exceptionForm.member_id} onChange={(event) => setExceptionForm({ ...exceptionForm, member_id: event.target.value })}><option value="">인원 선택</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{displayMember(member)}</option>)}</select></label>
              <label>카테고리<select value={exceptionForm.category} onChange={(event) => setExceptionForm({ ...exceptionForm, category: event.target.value, customCategory: '' })}>{activeCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              {exceptionForm.category === OTHER_EXCEPTION_CATEGORY && (
                <label>기타 카테고리<input placeholder="예: 교육, 파견, 개인정비 등" value={exceptionForm.customCategory} onChange={(event) => setExceptionForm({ ...exceptionForm, customCategory: event.target.value })} /></label>
              )}
              <div className="date-range">
                <label>시작일<input type="date" value={exceptionForm.start_date} onChange={(event) => setExceptionForm({ ...exceptionForm, start_date: event.target.value, end_date: exceptionForm.end_date < event.target.value ? event.target.value : exceptionForm.end_date })} /></label>
                <label>종료일<input type="date" value={exceptionForm.end_date} onChange={(event) => setExceptionForm({ ...exceptionForm, end_date: event.target.value })} /></label>
              </div>
              <label>사유<input placeholder="직접 입력 예: 장기 외박, 병원 외진, 개인 휴가 등" value={exceptionForm.reason} onChange={(event) => setExceptionForm({ ...exceptionForm, reason: event.target.value })} /></label>
              <div className="actions"><button disabled={!exceptionForm.member_id || (exceptionForm.category === OTHER_EXCEPTION_CATEGORY && !exceptionForm.customCategory.trim())} onClick={saveException}>{exceptionForm.id ? '수정 저장' : '저장'}</button><button className="secondary" onClick={() => setExceptionForm({ ...emptyExceptionForm, start_date: date, end_date: date, category: activeCategories[0] ?? DEFAULT_EXCEPTION_CATEGORIES[0] })}>초기화</button></div>
            </div>
          </div>
          <div className="card col-7" ref={exceptionListRef}>
            <div className="section-title compact-title">
              <div>
                <h2>{exceptionListScope === 'day' ? date : date.slice(0, 7)} 열외 명단</h2>
                <p className="muted">날짜 범위와 카테고리 버튼으로 필요한 명단만 확인합니다.</p>
              </div>
            </div>
            <div className="filter-buttons" aria-label="열외 명단 기간 필터">
              <button className={exceptionListScope === 'day' ? 'active' : 'secondary'} onClick={() => setExceptionListScope('day')}>당일</button>
              <button className={exceptionListScope === 'month' ? 'active' : 'secondary'} onClick={() => setExceptionListScope('month')}>달 단위</button>
            </div>
            <div className="filter-buttons category-filters" aria-label="열외 카테고리 필터">
              {['전체', ...activeCategories].map((category) => (
                <button key={category} className={exceptionCategoryFilter === category ? 'active' : 'secondary'} onClick={() => setExceptionCategoryFilter(category)}>{category}</button>
              ))}
            </div>
            <div className="exception-list">
              {filteredListedExceptions.length === 0 && <p className="muted">조건에 맞는 열외 명단이 없습니다.</p>}
              {filteredListedExceptions.map((exception) => (
                <div className="exception-row" key={exception.id}>
                  <div className="exception-main">
                    <b>{exception.members ? displayMember(exception.members) : exception.member_id}</b>
                    <span>{exception.category}</span>
                    <p className="muted">{exception.date}{exception.reason ? ` · ${exception.reason}` : ' · 사유 없음'}</p>
                  </div>
                  <div className="exception-actions">
                    <button className="secondary compact" onClick={() => editException(exception)}>수정</button>
                    <button className="danger compact" onClick={() => deleteException(exception.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}


      {tab === 'daily' && (
        <section className="card">
          <h2>일일 보고사항 입력</h2>
          <div className="grid">{reportFields.map(([key, label]) => <label className="col-6" key={key}>{label}<textarea value={(dailyReport[key] ?? '') as string} onChange={(event) => setDailyReport({ ...dailyReport, [key]: event.target.value })} /></label>)}</div>
          <br /><button onClick={upsertDailyReport}>보고사항 저장</button>
        </section>
      )}

      {tab === 'report' && (
        <section className="grid">
          <div className="card col-6"><h2>미리보기</h2><pre className="report">{reportText}</pre></div>
          <div className="card col-6"><h2>원문 복사</h2><textarea className="report" value={reportText} readOnly /><br /><br /><button onClick={() => copyToClipboard(reportText)}>복사하기</button></div>
        </section>
      )}

      {tab === 'admin' && (
        <section className="grid">
          {!isAdmin && <p className="card col-12 warning">관리자 설정은 관리자 로그인 후 사용할 수 있습니다. 기본 관리자 ID는 tnthd입니다.</p>}
          <div className="card col-6 faded-when-disabled">
            <div className="section-title">
              <div>
                <h2>인원명부 관리</h2>
                <p className="muted">인원 추가 버튼으로 입력창을 열고, 목록에서 ↑↓로 우선순위를 바꾸거나 -로 삭제합니다.</p>
              </div>
              <button className="secondary compact" disabled={!isAdmin} onClick={() => { setMemberForm(emptyMemberForm); setShowMemberForm((value) => !value); }}>
                {showMemberForm ? '닫기' : '인원 추가'}
              </button>
            </div>
            {showMemberForm && <div className="stack add-panel">
              <label>이름<input disabled={!isAdmin} value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} /></label>
              <label>계급<select disabled={!isAdmin} value={memberForm.rank} onChange={(event) => setMemberForm({ ...memberForm, rank: event.target.value as Rank })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label>
              <label>소속<input disabled={!isAdmin} value={memberForm.unit} onChange={(event) => setMemberForm({ ...memberForm, unit: event.target.value })} /></label>
              <label>정렬 순서<input disabled={!isAdmin} type="number" value={memberForm.sort_order} onChange={(event) => setMemberForm({ ...memberForm, sort_order: Number(event.target.value) })} /></label>
              <label><input disabled={!isAdmin} className="inline-check" type="checkbox" checked={memberForm.active} onChange={(event) => setMemberForm({ ...memberForm, active: event.target.checked })} /> 활성 인원</label>
              <div className="actions"><button disabled={!isAdmin || !memberForm.name} onClick={saveMember}>저장</button><button className="secondary" disabled={!isAdmin} onClick={() => setMemberForm(emptyMemberForm)}>초기화</button></div>
            </div>}
            <div className="member-table">
              {sortMembers(members).map((member, index) => (
                <div className={`member-row ${member.active ? '' : 'inactive'}`} key={member.id}>
                  <div className="member-index">{index + 1}</div>
                  <div className="member-main">
                    <b>{displayMember(member)}</b>
                    <p className="muted">{member.unit} · 순서 {member.sort_order} · {member.active ? '활성' : '비활성'}</p>
                  </div>
                  <div className="member-actions">
                    <button className="icon-button secondary" disabled={!isAdmin || index === 0} onClick={() => moveMember(member, -1)} aria-label={`${displayMember(member)} 위로 이동`}>↑</button>
                    <button className="icon-button secondary" disabled={!isAdmin || index === members.length - 1} onClick={() => moveMember(member, 1)} aria-label={`${displayMember(member)} 아래로 이동`}>↓</button>
                    <button className="icon-button secondary" disabled={!isAdmin} onClick={() => { setMemberForm(member); setShowMemberForm(true); }} aria-label={`${displayMember(member)} 수정`}>✎</button>
                    <button className="icon-button danger" disabled={!isAdmin} onClick={() => deleteMember(member.id)} aria-label={`${displayMember(member)} 삭제`}>-</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card col-6 faded-when-disabled">
            <h2>열외 카테고리 관리</h2>
            <div className="stack">
              <label>카테고리명<input disabled={!isAdmin} placeholder="예: 외출" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></label>
              <label>정렬 순서<input disabled={!isAdmin} type="number" value={categoryForm.sort_order} onChange={(event) => setCategoryForm({ ...categoryForm, sort_order: Number(event.target.value) })} /></label>
              <label><input disabled={!isAdmin} className="inline-check" type="checkbox" checked={categoryForm.active} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.checked })} /> 활성 카테고리</label>
              <div className="actions"><button disabled={!isAdmin || !categoryForm.name} onClick={saveCategory}>저장</button><button className="secondary" disabled={!isAdmin} onClick={() => setCategoryForm(emptyCategoryForm)}>초기화</button></div>
            </div>
            <div className="list">{categories.map((category) => <div className="row" key={category.id}><div><b>{category.name}</b><p className="muted">순서 {category.sort_order} · {category.active ? '활성' : '비활성'}</p></div><button className="secondary" disabled={!isAdmin} onClick={() => setCategoryForm(category)}>수정</button></div>)}</div>
          </div>
        </section>
      )}
    </main>
  );
}
