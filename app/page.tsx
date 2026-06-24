'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { displayMember, emptyDailyReport, generateReportText, sortMembers, todayIso } from '@/lib/report';
import {
  ADMIN_ID,
  ADMIN_PASSWORD,
  DEFAULT_EXCEPTION_CATEGORIES,
  DEFAULT_UNIT,
  DailyException,
  DailyReport,
  ExceptionCategory,
  Member,
  RANKS,
} from '@/lib/types';

type Tab = 'exceptions' | 'daily' | 'report' | 'admin';

const reportFields = [
  ['assault', '구타 및 가혹행위'],
  ['verbal_abuse', '언어폭력'],
  ['sexual_misconduct', '성군기위반행위'],
  ['suicide_risk', '자살징후자'],
  ['complaints', '애로 및 건의사항'],
  ['patient', '환자'],
  ['next_day_work', '익일 처부일과'],
] as const;

const emptyMemberForm = { id: '', name: '', rank: '상병', unit: DEFAULT_UNIT, active: true, sort_order: 0 };
const emptyCategoryForm = { id: '', name: '', active: true, sort_order: 0 };

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [tab, setTab] = useState<Tab>('exceptions');
  const [date, setDate] = useState(todayIso());
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<ExceptionCategory[]>([]);
  const [exceptions, setExceptions] = useState<DailyException[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport>(emptyDailyReport(todayIso()));
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [exceptionForm, setExceptionForm] = useState({ id: '', member_id: '', category: DEFAULT_EXCEPTION_CATEGORIES[0], reason: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsAdmin(window.localStorage.getItem('daily-report-admin') === 'true');
    void refreshAll();
  }, []);

  useEffect(() => {
    void Promise.all([fetchExceptionsByDate(date), fetchDailyReport(date)]).catch(showError);
  }, [date]);

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

  async function fetchDailyReport(selectedDate: string) {
    const { data, error } = await supabase.from('daily_reports').select('*').eq('date', selectedDate).maybeSingle();
    if (error) throw error;
    setDailyReport(data ? (data as DailyReport) : emptyDailyReport(selectedDate));
  }

  async function refreshAll() {
    try {
      await Promise.all([fetchMembers(), fetchCategories(), fetchExceptionsByDate(date), fetchDailyReport(date)]);
    } catch (error) {
      showError(error);
    }
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
  }

  function loginAdmin() {
    if (adminId === ADMIN_ID && adminPassword === ADMIN_PASSWORD) {
      window.localStorage.setItem('daily-report-admin', 'true');
      setIsAdmin(true);
      setAdminPassword('');
      setMessage('관리자 모드로 전환했습니다.');
      return;
    }
    setMessage('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  function logoutAdmin() {
    window.localStorage.removeItem('daily-report-admin');
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
      await fetchMembers();
    }
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

  async function saveException() {
    const payload = { date, member_id: exceptionForm.member_id, category: exceptionForm.category, reason: exceptionForm.reason || null };
    const query = exceptionForm.id ? supabase.from('daily_exceptions').update(payload).eq('id', exceptionForm.id) : supabase.from('daily_exceptions').insert(payload);
    const { error } = await query;
    setMessage(error ? error.message : '열외 정보를 저장했습니다.');
    if (!error) {
      setExceptionForm({ id: '', member_id: '', category: activeCategories[0] ?? DEFAULT_EXCEPTION_CATEGORIES[0], reason: '' });
      await fetchExceptionsByDate(date);
    }
  }

  async function deleteException(id: string) {
    const { error } = await supabase.from('daily_exceptions').delete().eq('id', id);
    setMessage(error ? error.message : '열외 정보를 삭제했습니다.');
    if (!error) await fetchExceptionsByDate(date);
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
    return list.length > 0 ? list : DEFAULT_EXCEPTION_CATEGORIES;
  }, [categories]);
  const reportText = useMemo(() => generateReportText(date, members, exceptions, dailyReport), [date, members, exceptions, dailyReport]);

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>일일 인원/열외현황 보고문 생성기</h1>
          <p className="muted">비로그인 상태로 열외 입력과 보고문 생성을 사용할 수 있고, 관리자 모드에서 인원명부와 카테고리를 조절합니다.</p>
        </div>
        <div className="admin-box">
          {isAdmin ? (
            <div className="actions"><b>관리자 모드</b><button className="secondary" onClick={logoutAdmin}>관리자 종료</button></div>
          ) : (
            <div className="actions">
              <input aria-label="관리자 아이디" placeholder="관리자 ID" value={adminId} onChange={(event) => setAdminId(event.target.value)} />
              <input aria-label="관리자 비밀번호" placeholder="비밀번호" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} />
              <button onClick={loginAdmin}>관리자 로그인</button>
            </div>
          )}
        </div>
      </header>

      {!hasSupabaseConfig && <p className="card warning">Vercel 또는 .env.local에 Supabase 환경변수를 등록해야 실제 DB 저장이 작동합니다.</p>}
      <section className="card">
        <div className="grid">
          <label className="col-4">보고 날짜<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <div className="col-8 muted stat-line">총원 {activeMembers.length}명 · 열외 {exceptions.length}명 · 현재원 {activeMembers.length - exceptions.length}명</div>
        </div>
      </section>

      <nav className="tabs">
        {(['exceptions', 'daily', 'report', 'admin'] as Tab[]).map((item) => (
          <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
            {({ exceptions: '열외 입력', daily: '일일 보고사항', report: '보고문 생성', admin: '관리자 설정' } as Record<Tab, string>)[item]}
          </button>
        ))}
      </nav>
      {message && <p className="card muted">{message}</p>}

      {tab === 'exceptions' && (
        <section className="grid">
          <div className="card col-5">
            <h2>열외 입력</h2>
            <p className="muted">이름은 DB 명단에서 선택하고, 사유는 직접 입력합니다. 예: 이름 박스 선택 + 사유 “출타” 입력.</p>
            <div className="stack">
              <label>이름<select value={exceptionForm.member_id} onChange={(event) => setExceptionForm({ ...exceptionForm, member_id: event.target.value })}><option value="">인원 선택</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{displayMember(member)}</option>)}</select></label>
              <label>카테고리<select value={exceptionForm.category} onChange={(event) => setExceptionForm({ ...exceptionForm, category: event.target.value })}>{activeCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label>사유<input placeholder="직접 입력 예: 출타, 병원 외진, 개인 휴가 등" value={exceptionForm.reason} onChange={(event) => setExceptionForm({ ...exceptionForm, reason: event.target.value })} /></label>
              <div className="actions"><button disabled={!exceptionForm.member_id} onClick={saveException}>{exceptionForm.id ? '수정 저장' : '저장'}</button><button className="secondary" onClick={() => setExceptionForm({ id: '', member_id: '', category: activeCategories[0] ?? DEFAULT_EXCEPTION_CATEGORIES[0], reason: '' })}>초기화</button></div>
            </div>
          </div>
          <div className="card col-7">
            <h2>{date} 열외 명단</h2>
            <div className="list">{exceptions.map((exception) => <div className="row" key={exception.id}><div><b>{exception.members ? displayMember(exception.members) : exception.member_id}</b> · {exception.category}<p className="muted">{exception.reason || '사유 없음'}</p></div><div className="actions"><button className="secondary" onClick={() => setExceptionForm({ id: exception.id, member_id: exception.member_id, category: exception.category, reason: exception.reason ?? '' })}>수정</button><button className="danger" onClick={() => deleteException(exception.id)}>삭제</button></div></div>)}</div>
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
          {!isAdmin && <p className="card col-12 warning">관리자 설정은 관리자 로그인 후 사용할 수 있습니다. 기본 관리자 ID는 tnthdrmsan입니다.</p>}
          <div className="card col-6 faded-when-disabled">
            <h2>인원명부 관리</h2>
            <div className="stack">
              <label>이름<input disabled={!isAdmin} value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} /></label>
              <label>계급<select disabled={!isAdmin} value={memberForm.rank} onChange={(event) => setMemberForm({ ...memberForm, rank: event.target.value })}>{RANKS.map((rank) => <option key={rank}>{rank}</option>)}</select></label>
              <label>소속<input disabled={!isAdmin} value={memberForm.unit} onChange={(event) => setMemberForm({ ...memberForm, unit: event.target.value })} /></label>
              <label>정렬 순서<input disabled={!isAdmin} type="number" value={memberForm.sort_order} onChange={(event) => setMemberForm({ ...memberForm, sort_order: Number(event.target.value) })} /></label>
              <label><input disabled={!isAdmin} className="inline-check" type="checkbox" checked={memberForm.active} onChange={(event) => setMemberForm({ ...memberForm, active: event.target.checked })} /> 활성 인원</label>
              <div className="actions"><button disabled={!isAdmin || !memberForm.name} onClick={saveMember}>저장</button><button className="secondary" disabled={!isAdmin} onClick={() => setMemberForm(emptyMemberForm)}>초기화</button></div>
            </div>
            <div className="list">{members.map((member) => <div className="row" key={member.id}><div><b>{displayMember(member)}</b><p className="muted">{member.unit} · 순서 {member.sort_order} · {member.active ? '활성' : '비활성'}</p></div><button className="secondary" disabled={!isAdmin} onClick={() => setMemberForm(member)}>수정</button></div>)}</div>
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
