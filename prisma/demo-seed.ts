import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 決定論的に同じデータを再実行できるよう、すべて upsert / findFirst で書き分ける。
// 実行: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/demo-seed.ts

async function main() {
  console.log("Seeding demo data…");

  // 早期 e2e テストで残ったゴミデータをクリーンアップ（demo データには触らない）
  await prisma.applicationSchool.deleteMany({
    where: { schoolName: { in: ["x", "y"] } },
  });
  await prisma.application.deleteMany({
    where: {
      OR: [
        { applicationNo: { startsWith: "APP-" } },
        { lastName: { in: ["X", "Race", "Multi", "E2E", "Test", "Dup", "A"] } },
        { email: { contains: "@example.com" }, applicationNo: { not: { startsWith: "DEMO-" } } },
      ],
    },
  });
  await prisma.applySchool.deleteMany({ where: { schoolKey: { startsWith: "new-school-" } } });
  await prisma.applySchool.deleteMany({ where: { schoolKey: { startsWith: "sync-test-" } } });
  await prisma.cohort.deleteMany({ where: { name: { contains: "smoke" } } });
  await prisma.cohort.deleteMany({ where: { name: { contains: "E2E" } } });
  await prisma.agent.deleteMany({ where: { name: { in: ["a", "a-fixed", "v2-agent", "テストエージェント"] } } });
  await prisma.interviewer.deleteMany({ where: { name: { in: ["佐々木", "佐々木fixed", "v2-i"] } } });


  // ── 1) 志望校（公開ページに出る） ──────────────────────────────
  const schools = [
    {
      schoolKey: "chuo-seminar",
      name: "中央ゼミナール",
      hojin: "学校法人 羽場学園",
      icon: "🏫",
      displayOrder: 1,
      departments: JSON.stringify([
        { name: "日本語科", duration: "2年", courses: ["進学コース", "総合コース"] },
        { name: "理科進学科", duration: "1年", courses: [] },
        { name: "文科進学科", duration: "1年", courses: [] },
      ]),
    },
    {
      schoolKey: "kanagawa-judo",
      name: "神奈川柔整鍼灸専門学校",
      hojin: "学校法人 平井学園",
      icon: "🩺",
      displayOrder: 2,
      departments: JSON.stringify([
        { name: "柔道整復科", duration: "3年", courses: [] },
        { name: "鍼灸科", duration: "3年", courses: [] },
      ]),
    },
    {
      schoolKey: "tdb-tokyo-business",
      name: "TDB東京ビジネス専門学校",
      hojin: "学校法人 TDB学園",
      icon: "💼",
      displayOrder: 3,
      departments: JSON.stringify([
        { name: "ビジネスマネジメント科", duration: "2年制", courses: ["経営コース", "営業コース"] },
        { name: "国際ビジネス科",       duration: "2年制", courses: ["貿易コース", "通訳・翻訳コース"] },
        { name: "情報処理科",           duration: "2年制", courses: ["システム開発コース", "Web制作コース"] },
        { name: "会計ビジネス科",       duration: "2年制", courses: ["税理士コース", "公認会計士コース"] },
        { name: "ホテル・観光科",       duration: "2年制", courses: [] },
      ]),
    },
  ];
  for (const s of schools) {
    const saved = await prisma.applySchool.upsert({
      where: { schoolKey: s.schoolKey },
      update: { name: s.name, hojin: s.hojin, icon: s.icon, displayOrder: s.displayOrder, departments: s.departments, isActive: true },
      create: { ...s, isActive: true },
    });
    // ApplyDepartment table も同期（admin/schools GET は ApplyDepartment.isActive=true を参照する）
    const depts = JSON.parse(s.departments) as Array<{ name: string; duration?: string; courses?: string[] }>;
    const incomingNames = new Set(depts.map((d) => d.name));
    const existing = await prisma.applyDepartment.findMany({ where: { applySchoolId: saved.id } });
    const stale = existing.filter((e) => e.isActive && !incomingNames.has(e.name));
    if (stale.length > 0) {
      await prisma.applyDepartment.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { isActive: false },
      });
    }
    for (let i = 0; i < depts.length; i++) {
      const d = depts[i];
      await prisma.applyDepartment.upsert({
        where: { applySchoolId_name: { applySchoolId: saved.id, name: d.name } },
        create: {
          applySchoolId: saved.id, name: d.name,
          duration: d.duration || "2年制",
          courses: JSON.stringify(d.courses ?? []),
          displayOrder: i, isActive: true,
        },
        update: {
          duration: d.duration || "2年制",
          courses: JSON.stringify(d.courses ?? []),
          displayOrder: i, isActive: true,
        },
      });
    }
  }
  const deptCount = await prisma.applyDepartment.count({ where: { isActive: true } });
  console.log(`  applySchool: ${schools.length} 件, applyDepartment: ${deptCount} 件 (active)`);

  // ── 1.5) School (在籍管理用) + Course + Class + Subject ──────────
  // 入学手続き完了後に学生を在籍登録する先。ApplySchool とは別概念。
  const inSchoolDefs = [
    { shortName: "chuo", name: "中央ゼミナール", description: "出願→入学後の在籍管理" },
    { shortName: "kanagawa", name: "神奈川柔整鍼灸専門学校", description: "" },
    { shortName: "tdb", name: "TDB東京ビジネス専門学校", description: "" },
  ];
  for (const s of inSchoolDefs) {
    const existing = await prisma.school.findFirst({ where: { shortName: s.shortName } });
    const saved = existing
      ? await prisma.school.update({ where: { id: existing.id }, data: s })
      : await prisma.school.create({ data: s });
    // 課程・クラス・科目: 各校に最低 1 つずつ作っておく
    const courseName = s.shortName === "tdb" ? "ビジネスマネジメント" : s.shortName === "kanagawa" ? "柔道整復" : "日本語";
    const courseExisting = await prisma.course.findFirst({ where: { schoolId: saved.id, name: courseName } });
    const course = courseExisting
      ? courseExisting
      : await prisma.course.create({ data: { schoolId: saved.id, name: courseName, code: s.shortName.toUpperCase() } });
    const className = "2026年4月入学 A クラス";
    const classExisting = await prisma.class.findFirst({ where: { courseId: course.id, name: className } });
    if (!classExisting) {
      await prisma.class.create({ data: { courseId: course.id, name: className, year: 2026, month: 4 } });
    }
    const subjectName = s.shortName === "tdb" ? "経営学" : s.shortName === "kanagawa" ? "解剖学" : "総合日本語";
    const subjectExisting = await prisma.subject.findFirst({ where: { courseId: course.id, name: subjectName } });
    if (!subjectExisting) {
      await prisma.subject.create({ data: { courseId: course.id, name: subjectName, hoursPerWeek: 4 } });
    }
  }
  console.log(`  school (在籍): ${inSchoolDefs.length} 件 + course/class/subject 各 1`);

  // ── 2) Cohort（選考バッチ） ──────────────────────────────────
  const cohortDefs = [
    { name: "2026年度 第1回 (中央ゼミナール)", year: 2026, round: 1, schoolKey: "chuo-seminar", isDefault: true, status: "受付中" },
    { name: "2026年度 第2回 (中央ゼミナール)", year: 2026, round: 2, schoolKey: "chuo-seminar", isDefault: false, status: "受付中" },
    { name: "2026年度 第1回 (神奈川柔整)", year: 2026, round: 1, schoolKey: "kanagawa-judo", isDefault: false, status: "選考中" },
    { name: "2026年度 第1回 (TDB)", year: 2026, round: 1, schoolKey: "tdb-tokyo-business", isDefault: false, status: "受付中" },
    { name: "2025年度 第3回", year: 2025, round: 3, schoolKey: null, isDefault: false, status: "完了" },
  ];
  const allSchoolsForCohort = await prisma.applySchool.findMany();
  const schoolKeyToId = new Map(allSchoolsForCohort.map((s) => [s.schoolKey, s.id]));
  const cohortMap = new Map<string, string>();
  for (const c of cohortDefs) {
    const data = { ...c, applySchoolId: c.schoolKey ? schoolKeyToId.get(c.schoolKey) ?? null : null };
    const existing = await prisma.cohort.findFirst({ where: { name: c.name } });
    const saved = existing
      ? await prisma.cohort.update({ where: { id: existing.id }, data })
      : await prisma.cohort.create({ data });
    cohortMap.set(c.name, saved.id);
  }
  console.log(`  cohort: ${cohortDefs.length} 件`);

  // ── 3) Agent ────────────────────────────────────────────────
  const agentDefs = [
    { name: "東京中華教育センター", country: "中国", contactName: "李 偉", contactEmail: "li@example.cn" },
    { name: "ハノイ留学サポート", country: "ベトナム", contactName: "Nguyen Van Anh", contactEmail: "anh@example.vn" },
    { name: "カトマンズ日本語教育", country: "ネパール", contactName: "Sharma R.", contactEmail: null },
    { name: "個人紹介（無効）", country: "その他", contactName: null, contactEmail: null },
  ];
  const agentMap = new Map<string, string>();
  for (const a of agentDefs) {
    const existing = await prisma.agent.findFirst({ where: { name: a.name } });
    const saved = existing
      ? await prisma.agent.update({ where: { id: existing.id }, data: { ...a, isActive: a.name !== "個人紹介（無効）" } })
      : await prisma.agent.create({ data: { ...a, isActive: a.name !== "個人紹介（無効）" } });
    agentMap.set(a.name, saved.id);
  }
  console.log(`  agent: ${agentDefs.length} 件`);

  // ── 4) Interviewer ──────────────────────────────────────────
  const interviewers = [
    { name: "佐藤 健一", role: "教務主任", email: "sato@school.jp" },
    { name: "田中 美咲", role: "学科長", email: "tanaka@school.jp" },
    { name: "鈴木 隆", role: "面接官", email: null },
  ];
  for (const iv of interviewers) {
    const existing = await prisma.interviewer.findFirst({ where: { name: iv.name } });
    if (!existing) await prisma.interviewer.create({ data: iv });
  }
  console.log(`  interviewer: ${interviewers.length} 件`);

  // ── 5) Announcement ─────────────────────────────────────────
  const annDefs = [
    {
      title: "【重要】2026年度 第1回出願締切のお知らせ",
      content: "2026年度 第1回の出願締切は 2026年6月15日 17時 です。\n書類は余裕を持ってご提出ください。",
      targetType: "all" as const,
    },
    {
      title: "面接日程公開のお知らせ",
      content: "書類確認中の方には、来週中に面接日程をメールでご案内いたします。",
      targetType: "status_filter" as const,
      targetStatus: "書類確認中",
    },
  ];
  for (const a of annDefs) {
    const existing = await prisma.announcement.findFirst({ where: { title: a.title } });
    if (!existing) await prisma.announcement.create({ data: { ...a, createdBy: "demo-seed" } });
  }
  console.log(`  announcement: ${annDefs.length} 件`);

  // ── 6) EnrollmentQuota（学校×学科×年度） ───────────────────
  const quotaDefs = [
    { schoolName: "中央ゼミナール",         department: "日本語科",            enrollmentYear: "2026", quota: 60 },
    { schoolName: "中央ゼミナール",         department: "理科進学科",          enrollmentYear: "2026", quota: 30 },
    { schoolName: "中央ゼミナール",         department: "文科進学科",          enrollmentYear: "2026", quota: 25 },
    { schoolName: "神奈川柔整鍼灸専門学校",     department: "柔道整復科",          enrollmentYear: "2026", quota: 40 },
    { schoolName: "神奈川柔整鍼灸専門学校",     department: "鍼灸科",              enrollmentYear: "2026", quota: 35 },
    { schoolName: "TDB東京ビジネス専門学校",   department: "ビジネスマネジメント科", enrollmentYear: "2026", quota: 50 },
    { schoolName: "TDB東京ビジネス専門学校",   department: "国際ビジネス科",       enrollmentYear: "2026", quota: 40 },
    { schoolName: "TDB東京ビジネス専門学校",   department: "情報処理科",          enrollmentYear: "2026", quota: 60 },
    { schoolName: "TDB東京ビジネス専門学校",   department: "会計ビジネス科",       enrollmentYear: "2026", quota: 30 },
    { schoolName: "TDB東京ビジネス専門学校",   department: "ホテル・観光科",       enrollmentYear: "2026", quota: 30 },
    { schoolName: "中央ゼミナール",         department: "日本語科",            enrollmentYear: "2027", quota: 80, memo: "次年度拡大予定" },
  ];
  // FK 解決マップ（学校→部署）
  const schoolsWithDepts = await prisma.applySchool.findMany({ include: { applyDepartments: true } });
  const fkOf = (schoolName: string, deptName: string) => {
    const s = schoolsWithDepts.find((x) => x.name === schoolName);
    const d = s?.applyDepartments.find((x) => x.name === deptName && x.isActive);
    return { applySchoolId: s?.id ?? null, applyDepartmentId: d?.id ?? null };
  };
  for (const q of quotaDefs) {
    const fk = fkOf(q.schoolName, q.department);
    const data = { ...q, ...fk };
    await prisma.enrollmentQuota.upsert({
      where: {
        schoolName_department_enrollmentYear: {
          schoolName: q.schoolName, department: q.department, enrollmentYear: q.enrollmentYear,
        },
      },
      update: data,
      create: data,
    });
  }
  console.log(`  enrollmentQuota: ${quotaDefs.length} 件`);

  // ── 7) Application（多様なステータス） ──────────────────────
  // 既存の demo データをクリア（別 seed で作った admin / 出願は触らない）
  await prisma.application.deleteMany({ where: { applicationNo: { startsWith: "DEMO-" } } });

  type Demo = {
    suffix: string;
    lastName: string; firstName: string; lastNameKana: string; firstNameKana: string;
    nationality: string; japaneseLevel: string; gender: string;
    schoolName: string; department: string;
    enrollmentYear: string;
    applicationReason: string;
    status: string;
    cohortName?: string;
    agentName?: string;
    daysAgo: number;
    examFeeStatus?: string;
    interviewDate?: string; interviewTime?: string; interviewPlace?: string;
    additionalSchools?: { schoolName: string; department: string; course?: string }[];
    docTypes?: string[];
    examMode?: string;
  };

  const now = new Date();
  const demos: Demo[] = [
    {
      suffix: "0001", lastName: "王", firstName: "美麗", lastNameKana: "ワン", firstNameKana: "メイレイ",
      nationality: "中国", japaneseLevel: "N2", gender: "女性",
      schoolName: "中央ゼミナール", department: "日本語科",
      enrollmentYear: "2026", applicationReason: "日本でデザインを学び、将来は中国と日本を繋ぐクリエイターになりたいです。" + "国際的な視野を持ちたいと考えています。".repeat(3),
      status: "受付中", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "東京中華教育センター",
      daysAgo: 0, examFeeStatus: "確認中",
      docTypes: ["証明写真（3×3cm）", "JLPT成績証明書"],
    },
    {
      suffix: "0002", lastName: "李", firstName: "天宇", lastNameKana: "リ", firstNameKana: "テンウ",
      nationality: "中国", japaneseLevel: "N3", gender: "男性",
      schoolName: "中央ゼミナール", department: "理科進学科",
      enrollmentYear: "2026", applicationReason: "日本の理工系大学への進学を目指しています。中央ゼミナールの実績を見て志望しました。".repeat(2) + "頑張りたいと思います。",
      status: "書類確認中", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "東京中華教育センター",
      daysAgo: 2, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書"],
    },
    {
      suffix: "0003", lastName: "Nguyen", firstName: "Hoa", lastNameKana: "グエン", firstNameKana: "ホア",
      nationality: "ベトナム", japaneseLevel: "N3", gender: "女性",
      schoolName: "中央ゼミナール", department: "文科進学科",
      enrollmentYear: "2026", applicationReason: "日本文学に興味があり、文学部進学を希望しています。中央ゼミナールでしっかり準備したいです。".repeat(3),
      status: "面接待ち", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "ハノイ留学サポート",
      daysAgo: 5, examFeeStatus: "確認済み",
      interviewDate: "2026-05-25", interviewTime: "14:00", interviewPlace: "中央ゼミナール 本館3F 面接室A",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書", "高校卒業証明書"],
    },
    {
      suffix: "0004", lastName: "Tran", firstName: "Minh", lastNameKana: "チャン", firstNameKana: "ミン",
      nationality: "ベトナム", japaneseLevel: "N4", gender: "男性",
      schoolName: "中央ゼミナール", department: "日本語科",
      enrollmentYear: "2026", applicationReason: "日本語をしっかり勉強してから大学進学を目指したいです。" + "ベトナムでは日本語学校に2年通いました。".repeat(2),
      status: "面接待ち", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "ハノイ留学サポート",
      daysAgo: 7, examFeeStatus: "確認済み",
      interviewDate: "2026-05-26", interviewTime: "10:00", interviewPlace: "中央ゼミナール 本館3F 面接室A",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書"],
    },
    {
      suffix: "0005", lastName: "陳", firstName: "雅婷", lastNameKana: "チン", firstNameKana: "ガテイ",
      nationality: "中国台湾", japaneseLevel: "N1", gender: "女性",
      schoolName: "中央ゼミナール", department: "理科進学科",
      enrollmentYear: "2026", applicationReason: "東京大学の医学部進学を目指して、中央ゼミナールで万全の準備をしたいです。台湾で医療系の高校を卒業しました。".repeat(2),
      status: "合格", cohortName: "2026年度 第1回 (中央ゼミナール)",
      daysAgo: 14, examFeeStatus: "確認済み",
      additionalSchools: [
        { schoolName: "中央ゼミナール", department: "文科進学科" },
      ],
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書", "高校卒業証明書", "高校成績証明書"],
      examMode: "特待生",
    },
    {
      suffix: "0006", lastName: "Sharma", firstName: "Aarav", lastNameKana: "シャルマ", firstNameKana: "アーラブ",
      nationality: "ネパール", japaneseLevel: "N3", gender: "男性",
      schoolName: "中央ゼミナール", department: "日本語科",
      enrollmentYear: "2026", applicationReason: "日本のIT企業に就職するため、日本語と専門知識を学びたいです。ネパールでコンピューターサイエンスを勉強しました。".repeat(2),
      status: "合格", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "カトマンズ日本語教育",
      daysAgo: 14, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書"],
    },
    {
      suffix: "0007", lastName: "金", firstName: "ジヨン", lastNameKana: "キム", firstNameKana: "ジヨン",
      nationality: "韓国", japaneseLevel: "N2", gender: "女性",
      schoolName: "中央ゼミナール", department: "文科進学科",
      enrollmentYear: "2026", applicationReason: "日本のアニメ・漫画文化に魅了され、日本の大学で日本文化を本格的に研究したいと思っています。".repeat(2) + "頑張ります。",
      status: "合格", cohortName: "2026年度 第1回 (中央ゼミナール)",
      daysAgo: 21, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書", "高校卒業証明書"],
    },
    {
      suffix: "0008", lastName: "張", firstName: "偉強", lastNameKana: "チョウ", firstNameKana: "イキョウ",
      nationality: "中国", japaneseLevel: "N3", gender: "男性",
      schoolName: "中央ゼミナール", department: "理科進学科",
      enrollmentYear: "2026", applicationReason: "工学系の大学院進学を希望しています。日本の高い技術力を学びたいです。".repeat(3),
      status: "補欠合格", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "東京中華教育センター",
      daysAgo: 21, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書"],
    },
    {
      suffix: "0009", lastName: "Wong", firstName: "Ming", lastNameKana: "ウォン", firstNameKana: "ミン",
      nationality: "中国", japaneseLevel: "N5", gender: "男性",
      schoolName: "中央ゼミナール", department: "日本語科",
      enrollmentYear: "2026", applicationReason: "日本語の基礎から学びたいです。",
      status: "不合格", cohortName: "2026年度 第1回 (中央ゼミナール)",
      daysAgo: 25, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）"],
    },
    {
      suffix: "0010", lastName: "Lin", firstName: "Yiwei", lastNameKana: "リン", firstNameKana: "イーウェイ",
      nationality: "中国", japaneseLevel: "N4", gender: "女性",
      schoolName: "中央ゼミナール", department: "文科進学科",
      enrollmentYear: "2026", applicationReason: "経済学を専攻したいです。日本での留学経験を積みたいと考えています。".repeat(2),
      status: "保留", cohortName: "2026年度 第1回 (中央ゼミナール)",
      daysAgo: 30, examFeeStatus: "未払い",
      docTypes: ["証明写真（3×3cm）"],
    },
    {
      suffix: "0011", lastName: "山田", firstName: "太郎", lastNameKana: "ヤマダ", firstNameKana: "タロウ",
      nationality: "日本", japaneseLevel: "N1", gender: "男性",
      schoolName: "神奈川柔整鍼灸専門学校", department: "柔道整復科",
      enrollmentYear: "2026", applicationReason: "高校でラグビー部の主将を務め、ケガからの復帰を支えてくれたトレーナーに憧れて柔道整復師を志望しました。".repeat(2),
      status: "面接待ち", cohortName: "2026年度 第1回 (神奈川柔整)",
      daysAgo: 3, examFeeStatus: "確認済み",
      interviewDate: "2026-05-28", interviewTime: "13:00", interviewPlace: "神奈川柔整 1F 面接室",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書"],
    },
    {
      suffix: "0012", lastName: "佐藤", firstName: "美香", lastNameKana: "サトウ", firstNameKana: "ミカ",
      nationality: "日本", japaneseLevel: "N1", gender: "女性",
      schoolName: "神奈川柔整鍼灸専門学校", department: "鍼灸科",
      enrollmentYear: "2026", applicationReason: "母が長年腰痛で苦しんでおり、鍼灸治療で症状が改善しました。私もこの仕事で人を助けたいです。".repeat(2),
      status: "受付中", cohortName: "2026年度 第1回 (神奈川柔整)",
      daysAgo: 1, examFeeStatus: "未払い",
      docTypes: ["証明写真（3×3cm）"],
    },
    {
      suffix: "0013", lastName: "Park", firstName: "Sungho", lastNameKana: "パク", firstNameKana: "ソンホ",
      nationality: "韓国", japaneseLevel: "N2", gender: "男性",
      schoolName: "TDB東京ビジネス専門学校", department: "国際ビジネス科",
      enrollmentYear: "2026",
      applicationReason: "韓国でビジネスを学んだ後、日本でグローバルビジネスのキャリアを築きたいです。".repeat(3),
      status: "書類確認中", cohortName: "2026年度 第1回 (中央ゼミナール)",
      daysAgo: 4, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "JLPT成績証明書", "高校卒業証明書"],
    },
    {
      suffix: "0014", lastName: "周", firstName: "明傑", lastNameKana: "シュウ", firstNameKana: "メイケツ",
      nationality: "中国", japaneseLevel: "N2", gender: "男性",
      schoolName: "TDB東京ビジネス専門学校", department: "情報処理科",
      enrollmentYear: "2026",
      applicationReason: "プログラミングを本格的に学び、日本のIT企業で活躍したいと考えています。".repeat(3),
      status: "合格", cohortName: "2026年度 第1回 (中央ゼミナール)", agentName: "東京中華教育センター",
      daysAgo: 18, examFeeStatus: "確認済み",
      docTypes: ["証明写真（3×3cm）", "最終学校の成績証明書", "JLPT成績証明書", "高校卒業証明書"],
    },
  ];

  const today = new Date();
  let created = 0;

  // FK 解決用のマップを構築
  const allSchools = await prisma.applySchool.findMany({ include: { applyDepartments: true } });
  const fkLookup = (schoolName: string, deptName: string): { sid: string | null; did: string | null } => {
    const s = allSchools.find((x) => x.name === schoolName);
    if (!s) return { sid: null, did: null };
    const d = s.applyDepartments.find((x) => x.name === deptName && x.isActive);
    return { sid: s.id, did: d?.id ?? null };
  };

  for (const d of demos) {
    const createdAt = new Date(today.getTime() - d.daysAgo * 24 * 60 * 60 * 1000);
    const cohortId = d.cohortName ? cohortMap.get(d.cohortName) : null;
    const agentId = d.agentName ? agentMap.get(d.agentName) : null;
    const applicationNo = `DEMO-${d.suffix}`;

    const primaryFk = fkLookup(d.schoolName, d.department);
    const additionalFks = (d.additionalSchools ?? []).map((s) => ({
      ...s,
      ...fkLookup(s.schoolName, s.department),
    }));

    const app = await prisma.application.create({
      data: {
        applicationNo,
        status: d.status,
        createdAt,
        updatedAt: createdAt,
        applySchoolId: primaryFk.sid,
        applyDepartmentId: primaryFk.did,
        lastName: d.lastName, firstName: d.firstName,
        lastNameKana: d.lastNameKana, firstNameKana: d.firstNameKana,
        birthDate: "2003-04-15", gender: d.gender,
        nationality: d.nationality, phone: "090-1234-5678",
        email: `demo-${d.suffix}@example.com`,
        postalCode: "100-0001", prefecture: "東京都", city: "千代田区", address: "1-1-1",
        japaneseLevel: d.japaneseLevel, jlptCertified: ["N1", "N2"].includes(d.japaneseLevel),
        schoolName: d.schoolName, department: d.department, course: null,
        enrollmentYear: d.enrollmentYear, enrollmentMonth: "4",
        applicationReason: d.applicationReason,
        lastSchoolName: d.nationality === "日本" ? "県立横浜高等学校" : "現地高校",
        lastSchoolCountry: d.nationality === "日本" ? "日本" : d.nationality,
        lastSchoolGraduate: "卒業見込み",
        examMode: d.examMode || "一般",
        examFeeStatus: d.examFeeStatus || "未払い",
        examFeeAmount: 20000 + (d.additionalSchools?.length ?? 0) * 20000,
        interviewDate: d.interviewDate || null,
        interviewTime: d.interviewTime || null,
        interviewPlace: d.interviewPlace || null,
        cohortId, agentId,
        applicationSchools: {
          create: [
            {
              priority: 1, schoolName: d.schoolName, department: d.department, course: null,
              enrollmentYear: d.enrollmentYear, enrollmentMonth: "4",
              result: d.status === "合格" || d.status === "補欠合格" ? d.status : null,
              applySchoolId: primaryFk.sid,
              applyDepartmentId: primaryFk.did,
            },
            ...additionalFks.map((s, i) => ({
              priority: i + 2, schoolName: s.schoolName, department: s.department, course: s.course || null,
              enrollmentYear: d.enrollmentYear, enrollmentMonth: "4", result: null,
              applySchoolId: s.sid,
              applyDepartmentId: s.did,
            })),
          ],
        },
        documents: d.docTypes ? {
          create: d.docTypes.map((t, i) => ({
            docType: t,
            fileName: `demo_${d.suffix}_${i}.png`,
            originalName: `${t}.png`,
            filePath: `/uploads/demo/${d.suffix}/${i}.png`,
            fileSize: 1024 * (50 + i * 10),
            mimeType: "image/png",
            uploadedAt: new Date(createdAt.getTime() + 1000 * 60 * (i + 1)),
          })),
        } : undefined,
      },
    });

    // 合格者 / 補欠合格者には EnrollmentProcedure を作る
    if (d.status === "合格" || d.status === "補欠合格") {
      await prisma.enrollmentProcedure.create({
        data: {
          applicationId: app.id,
          instructions: "おめでとうございます！入学手続きを以下の手順で完了してください。",
          status: d.suffix === "0005" ? "STEP1完了" : "案内済み",
          publishedAt: createdAt,
          tuitionPlan: "全額",
          tuitionAmount: "350,000円",
          tuitionPaid: d.suffix === "0005",
          tuitionPaidAt: d.suffix === "0005" ? new Date() : null,
          docChecklist: JSON.stringify([
            { name: "入学誓約書", required: true, done: d.suffix === "0005" },
            { name: "健康診断書", required: true, done: false },
            { name: "パスポートコピー", required: true, done: d.suffix === "0005" },
          ]),
          schoolConfirmed: false,
          admitLetterIssued: false,
        },
      });
    }

    // 面接待ち → InterviewFeedback の下書き
    if (d.status === "面接待ち" && d.interviewDate) {
      const sato = await prisma.interviewer.findFirst({ where: { name: "佐藤 健一" } });
      await prisma.interviewFeedback.create({
        data: {
          applicationId: app.id,
          interviewerId: sato?.id || null,
          interviewerName: "佐藤 健一",
          recommendation: "保留",
        },
      });
    }

    created++;
  }
  console.log(`  application: ${created} 件 (DEMO-0001〜DEMO-${String(created).padStart(4, "0")})`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
