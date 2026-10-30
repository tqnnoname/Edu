import { Exam, ExamBundle } from '../types/exam';

// Đã xóa toàn bộ đề thi tạo sẵn theo yêu cầu của người dùng.
export const PRESET_EXAMS: Exam[] = [];

export const PRESET_BUNDLES: ExamBundle[] = [];

// Đề thi mẫu chuẩn minh họa đầy đủ 4 dạng câu hỏi mới (Đơn, Đúng/Sai, Nhập văn bản, Câu hỏi chùm)
// Có thể kích hoạt khi người dùng muốn thử nghiệm nhanh tính năng.
export const SAMPLE_DEMO_EXAM: Exam = {
  id: 'demo-full-formats-2026',
  title: 'Đề Thi Thử Nghiệm Chuẩn Cấu Trúc Đa Dạng (Minh Họa Đủ Các Dạng Câu)',
  subject: 'math',
  grade: 'Lớp 12 / Khảo sát Năng Lực',
  durationMinutes: 45,
  description: 'Đề minh họa các dạng: Trắc nghiệm nhiều lựa chọn tùy biến ý, Trắc nghiệm Đúng/Sai cho từng ý, Trả lời ngắn nhập số, và Câu hỏi chùm đọc hiểu.',
  instructions: `1. Thời gian làm bài: 45 phút. Đề thi gồm 4 phần tương ứng 4 dạng câu hỏi.
2. Thí sinh có thể sử dụng máy tính bỏ túi và bảng nháp tích hợp sẵn trên hệ thống.
3. Với câu trắc nghiệm Đúng/Sai: Mỗi ý đúng sẽ nhận điểm theo cơ cấu cho điểm.
4. Với câu trả lời ngắn: Điền số hoặc kết quả vào ô trống (dùng dấu chấm "." hoặc phẩy "," cho số thập phân).
5. Không thoát khỏi màn hình làm bài trong suốt thời gian thi.`,
  settings: {
    shuffleQuestions: false,
    shuffleOptions: false,
  },
  totalQuestions: 4,
  totalPoints: 10.0,
  createdAt: '2026-03-29',
  isCustom: false,
  questions: [
    {
      id: 'q_demo_single',
      type: 'single_choice',
      points: 2.5,
      question: 'Cho hàm số $y = f(x) = x^3 - 3x + 2$. Giá trị cực đại $y_{CĐ}$ của hàm số bằng:',
      options: [
        '$y_{CĐ} = 4$ tại $x = -1$',
        '$y_{CĐ} = 0$ tại $x = 1$',
        '$y_{CĐ} = 2$ tại $x = 0$',
        '$y_{CĐ} = -2$ tại $x = 2$',
        '$y_{CĐ} = 6$ tại $x = -2$' // 5 options example!
      ],
      correctAnswer: 0,
      explanation: 'Ta có $y\' = 3x^2 - 3 = 0 \\iff x = \\pm 1$.\nBảng xét dấu: $y\'$ đổi dấu từ dương sang âm khi qua $x = -1$, suy ra hàm số đạt cực đại tại $x = -1$ với $y_{CĐ} = (-1)^3 - 3(-1) + 2 = 4$.',
      topic: 'Hàm số & Cực trị',
      difficulty: 'easy'
    },
    {
      id: 'q_demo_tf',
      type: 'true_false',
      points: 2.5, // Total 2.5 points, 4 items = 0.625 points each by default
      question: 'Cho hàm số $f(x) = \\frac{2x - 1}{x + 1}$ có đồ thị $(C)$. Xét tính Đúng/Sai của các mệnh đề sau:',
      explanation: 'a) TXĐ: $D = \\mathbb{R} \\setminus \\{-1\\}$. Đúng.\nb) Tiệm cận đứng: $x = -1$. Đúng.\nc) $y\' = \\frac{2(1) - (-1)(1)}{(x+1)^2} = \\frac{3}{(x+1)^2} > 0 \\; \\forall x \\ne -1$ nên hàm số đồng biến trên từng khoảng xác định. Mệnh đề ghi nghịch biến là Sai.\nd) Điểm uốn/giao 2 tiệm cận là $I(-1; 2)$. Mệnh đề ghi $I(2; -1)$ là Sai.',
      topic: 'Khảo sát hàm số',
      difficulty: 'medium',
      tfItems: [
        {
          id: 'tf_1',
          statement: 'Tập xác định của hàm số là $D = \\mathbb{R} \\setminus \\{-1\\}$.',
          isCorrect: true,
          points: 0.5
        },
        {
          id: 'tf_2',
          statement: 'Đồ thị $(C)$ có đường tiệm cận đứng là đường thẳng $x = -1$.',
          isCorrect: true,
          points: 0.5
        },
        {
          id: 'tf_3',
          statement: 'Hàm số nghịch biến trên khoảng $(-\\infty; -1)$.',
          isCorrect: false,
          points: 0.75
        },
        {
          id: 'tf_4',
          statement: 'Tâm đối xứng của đồ thị $(C)$ là điểm $I(2; -1)$.',
          isCorrect: false,
          points: 0.75
        }
      ]
    },
    {
      id: 'q_demo_text',
      type: 'text_input',
      points: 2.5,
      question: 'Tính diện tích hình phẳng giới hạn bởi đồ thị hàm số $y = x^2 - 4x$ và trục hoành $Ox$. (Nhập kết quả dưới dạng số thập phân làm tròn 2 chữ số hoặc phân số tối giản)',
      acceptedAnswers: ['32/3', '10.67', '10,67', '10.66'],
      caseSensitive: false,
      explanation: 'Phương trình hoành độ giao điểm: $x^2 - 4x = 0 \\iff x = 0$ hoặc $x = 4$.\nDiện tích: $S = \\int_0^4 |x^2 - 4x|dx = -\\int_0^4 (x^2 - 4x)dx = -\\left[\\frac{x^3}{3} - 2x^2\\right]_0^4 = -\\left(\\frac{64}{3} - 32\\right) = \\frac{32}{3} \\approx 10.67$.',
      topic: 'Tích phân & Diện tích',
      difficulty: 'medium'
    },
    {
      id: 'q_demo_grouped',
      type: 'grouped',
      points: 2.5,
      question: `**BỐI CẢNH DÙNG CHUNG CHO CÁC CÂU HỎI CON:**
Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - 2y + z + 1 = 0$ có vectơ pháp tuyến $\vec{n} = (2; -2; 1)$ và mặt cầu $(S): (x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 25$. Cho hai điểm $A(1; 0; 0), B(3; -2; 1)$ xác định vectơ $\overrightarrow{AB}$.
Hãy trả lời 2 câu hỏi con bên dưới dựa trên dữ kiện này:`,
      explanation: 'Mặt cầu $(S)$ có tâm $I(1; -2; 3)$, bán kính $R = \\sqrt{25} = 5$.\nKhoảng cách từ tâm $I$ đến $(P)$: $d = \\frac{|2(1) - 2(-2) + 3 + 1|}{\\sqrt{2^2 + (-2)^2 + 1^2}} = \\frac{|10|}{3} = \\frac{10}{3}$.\nVì $d = \\frac{10}{3} < R = 5$, mặt phẳng $(P)$ cắt mặt cầu $(S)$ theo một đường tròn có bán kính $r = \\sqrt{R^2 - d^2} = \\sqrt{25 - \\frac{100}{9}} = \\sqrt{\\frac{125}{9}} = \\frac{5\\sqrt{5}}{3}$.',
      topic: 'Hình học Oxyz & Mặt cầu',
      difficulty: 'hard',
      subQuestions: [
        {
          id: 'sub_q1',
          type: 'single_choice',
          points: 1.25,
          question: 'Tọa độ tâm $I$ và bán kính $R$ của mặt cầu $(S)$ là:',
          options: [
            '$I(1; -2; 3)$ và $R = 5$',
            '$I(-1; 2; -3)$ và $R = 25$',
            '$I(1; 2; 3)$ và $R = 5$',
            '$I(-1; -2; -3)$ và $R = 5$'
          ],
          correctAnswer: 0,
          explanation: 'Phương trình $(x - a)^2 + (y - b)^2 + (z - c)^2 = R^2$ có tâm $I(a; b; c) = (1; -2; 3)$ và $R = 5$.'
        },
        {
          id: 'sub_q2',
          type: 'text_input',
          points: 1.25,
          question: 'Tính khoảng cách $d$ từ tâm $I$ của mặt cầu $(S)$ đến mặt phẳng $(P)$ (nhập phân số tối giản dạng a/b hoặc số thập phân):',
          acceptedAnswers: ['10/3', '3.33', '3,33'],
          caseSensitive: false,
          explanation: '$d(I, P) = \\frac{|2(1) - 2(-2) + 3 + 1|}{\\sqrt{4 + 4 + 1}} = \\frac{10}{3}$.'
        }
      ]
    }
  ]
};
