import bcrypt from "bcryptjs";
import type { Difficulty, Role } from "@uniexam/contracts";
import { query, queryOne, withTransaction } from "../src/pool";

export interface NewUser {
  username: string;
  fullName: string;
  password: string;
  role: Role;
  email?: string;
}

/** Tạo người dùng nếu chưa tồn tại (theo username). Trả về id và cờ đã tạo mới. */
export async function ensureUser(
  user: NewUser,
): Promise<{ id: string; created: boolean }> {
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE lower(username) = lower($1)",
    [user.username],
  );
  if (existing) return { id: existing.id, created: false };
  const hash = await bcrypt.hash(user.password, 10);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (username, full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.username, user.fullName, user.email ?? null, hash, user.role],
  );
  return { id: row!.id, created: true };
}

/** Tạo tài khoản quản trị đầu tiên (hoặc thêm quản trị viên mới). */
export function createAdmin(
  username: string,
  password: string,
  fullName = "Quản trị viên",
) {
  return ensureUser({ username, password, fullName, role: "admin" });
}

interface SeedQuestion {
  content: string;
  options: string[];
  correct: number[];
  chapter: string;
  topic: string;
  difficulty: Difficulty;
  points: number;
}

const SUBJECT = "Nhập môn lập trình";

const QUESTIONS: SeedQuestion[] = [
  {
    content: "Biến trong lập trình dùng để làm gì?",
    options: [
      "Lưu trữ dữ liệu trong bộ nhớ",
      "Vẽ giao diện",
      "Kết nối mạng",
      "Tăng tốc CPU",
    ],
    correct: [0],
    chapter: "Chương 1",
    topic: "Biến và kiểu dữ liệu",
    difficulty: "easy",
    points: 1,
  },
  {
    content: "Kiểu dữ liệu nào phù hợp nhất để lưu giá trị đúng/sai?",
    options: ["int", "boolean", "string", "float"],
    correct: [1],
    chapter: "Chương 1",
    topic: "Biến và kiểu dữ liệu",
    difficulty: "easy",
    points: 1,
  },
  {
    content: "Kết quả của biểu thức 7 % 3 là gì?",
    options: ["2", "1", "0", "3"],
    correct: [1],
    chapter: "Chương 1",
    topic: "Toán tử",
    difficulty: "easy",
    points: 1,
  },
  {
    content: "Vòng lặp nào luôn thực hiện thân vòng lặp ít nhất một lần?",
    options: ["for", "while", "do...while", "foreach"],
    correct: [2],
    chapter: "Chương 2",
    topic: "Vòng lặp",
    difficulty: "medium",
    points: 1,
  },
  {
    content: "Câu lệnh nào dùng để thoát sớm khỏi vòng lặp?",
    options: ["continue", "break", "return;", "exit()"],
    correct: [1],
    chapter: "Chương 2",
    topic: "Vòng lặp",
    difficulty: "easy",
    points: 1,
  },
  {
    content: "Những đặc điểm nào sau đây đúng với hàm (function)?",
    options: [
      "Có thể nhận tham số",
      "Có thể trả về giá trị",
      "Bắt buộc phải có biến toàn cục",
      "Giúp tái sử dụng mã",
    ],
    correct: [0, 1, 3],
    chapter: "Chương 3",
    topic: "Hàm",
    difficulty: "medium",
    points: 2,
  },
  {
    content:
      "Độ phức tạp thời gian của tìm kiếm tuần tự trong mảng n phần tử là?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
    correct: [2],
    chapter: "Chương 4",
    topic: "Thuật toán tìm kiếm",
    difficulty: "medium",
    points: 1,
  },
  {
    content: "Tìm kiếm nhị phân yêu cầu điều kiện gì của mảng?",
    options: [
      "Mảng đã được sắp xếp",
      "Mảng không có phần tử trùng",
      "Mảng có số phần tử chẵn",
      "Không yêu cầu gì",
    ],
    correct: [0],
    chapter: "Chương 4",
    topic: "Thuật toán tìm kiếm",
    difficulty: "medium",
    points: 1,
  },
  {
    content: "Đệ quy cần có thành phần nào để không lặp vô hạn?",
    options: ["Điều kiện dừng", "Biến toàn cục", "Vòng lặp for", "Con trỏ"],
    correct: [0],
    chapter: "Chương 3",
    topic: "Đệ quy",
    difficulty: "medium",
    points: 1,
  },
  {
    content:
      "Cấu trúc dữ liệu nào hoạt động theo nguyên tắc vào sau ra trước (LIFO)?",
    options: [
      "Hàng đợi (queue)",
      "Ngăn xếp (stack)",
      "Danh sách liên kết",
      "Cây nhị phân",
    ],
    correct: [1],
    chapter: "Chương 5",
    topic: "Cấu trúc dữ liệu",
    difficulty: "easy",
    points: 1,
  },
  {
    content: "Thuật toán sắp xếp nào có độ phức tạp trung bình O(n log n)?",
    options: ["Bubble sort", "Insertion sort", "Merge sort", "Selection sort"],
    correct: [2],
    chapter: "Chương 4",
    topic: "Thuật toán sắp xếp",
    difficulty: "hard",
    points: 2,
  },
  {
    content: "Những ngôn ngữ nào sau đây là ngôn ngữ lập trình?",
    options: ["Python", "HTML", "Java", "C++"],
    correct: [0, 2, 3],
    chapter: "Chương 1",
    topic: "Tổng quan",
    difficulty: "easy",
    points: 1,
  },
];

export interface DemoCredentials {
  admin: { username: string; password: string };
  teacher: { username: string; password: string };
  students: Array<{ username: string; password: string }>;
}

export const DEMO_CREDENTIALS: DemoCredentials = {
  admin: { username: "admin", password: "12345" },
  teacher: { username: "gv01", password: "12345" },
  students: Array.from({ length: 5 }, (_, i) => ({
    username: `sv00${i + 1}`,
    password: "12345",
  })),
};

const DEMO_EXAM_TITLE = "Kiểm tra giữa kỳ - Nhập môn lập trình (demo)";
const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Nạp dữ liệu mẫu: 1 quản trị viên, 1 giáo viên, 5 sinh viên, ngân hàng câu hỏi,
 * một đề thi và một kỳ thi đã phát hành. Chạy lại không tạo trùng.
 */
export async function seedDemo(): Promise<{ created: boolean }> {
  const { admin, teacher, students } = DEMO_CREDENTIALS;
  await ensureUser({
    ...admin,
    fullName: "Quản trị viên",
    role: "admin",
    email: "admin@uniexam.local",
  });
  const teacherUser = await ensureUser({
    ...teacher,
    fullName: "Nguyễn Văn Giáo",
    role: "teacher",
    email: "gv01@uniexam.local",
  });
  const studentIds: string[] = [];
  for (const [i, s] of students.entries()) {
    const u = await ensureUser({
      ...s,
      fullName: `Sinh viên ${i + 1}`,
      role: "student",
      email: `${s.username}@uniexam.local`,
    });
    studentIds.push(u.id);
  }

  const existing = await queryOne("SELECT 1 FROM exams WHERE title = $1", [
    DEMO_EXAM_TITLE,
  ]);
  if (existing) return { created: false };

  await withTransaction(async (tx) => {
    const questionIds: string[] = [];
    for (const q of QUESTIONS) {
      const options = q.options.map((text, i) => ({ id: letter(i), text }));
      const rows = await query<{ id: string }>(
        `INSERT INTO questions (owner_id, subject, chapter, topic, difficulty, type, content, options, correct_option_ids, points)
         VALUES ($1, $2, $3, $4, $5, 'multiple_choice', $6, $7::jsonb, $8, $9) RETURNING id`,
        [
          teacherUser.id,
          SUBJECT,
          q.chapter,
          q.topic,
          q.difficulty,
          q.content,
          JSON.stringify(options),
          q.correct.map(letter),
          q.points,
        ],
        tx,
      );
      questionIds.push(rows[0].id);
    }

    const paper = await query<{ id: string }>(
      `INSERT INTO exam_papers (owner_id, title, subject, description)
       VALUES ($1, 'Đề giữa kỳ - Nhập môn lập trình', $2, 'Đề mẫu gồm toàn bộ ngân hàng câu hỏi demo') RETURNING id`,
      [teacherUser.id, SUBJECT],
      tx,
    );
    const paperId = paper[0].id;
    await query(
      `INSERT INTO exam_paper_questions (paper_id, position, question_id, type, content, options, correct_option_ids, points, chapter, topic, difficulty)
       SELECT $1, u.pos, q.id, q.type, q.content, q.options, q.correct_option_ids, q.points, q.chapter, q.topic, q.difficulty
       FROM unnest($2::uuid[]) WITH ORDINALITY AS u(qid, pos)
       JOIN questions q ON q.id = u.qid`,
      [paperId, questionIds],
      tx,
    );

    const exam = await query<{ id: string }>(
      `INSERT INTO exams (owner_id, title, subject, description, paper_id, start_time, end_time, duration_minutes, question_count, status)
       VALUES ($1, $2, $3, 'Kỳ thi mẫu để thử nghiệm hệ thống.', $4, now() - interval '1 minute', now() + interval '7 days', 30, $5, 'published')
       RETURNING id`,
      [teacherUser.id, DEMO_EXAM_TITLE, SUBJECT, paperId, QUESTIONS.length],
      tx,
    );
    await query(
      `INSERT INTO exam_audience (exam_id, student_id) SELECT $1, unnest($2::uuid[])`,
      [exam[0].id, studentIds],
      tx,
    );
  });
  return { created: true };
}
