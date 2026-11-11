import { OJProblem } from '../types/exam';

export const PRESET_OJ_PROBLEMS: OJProblem[] = [
  {
    id: 'oj_lis',
    code: 'VNOI_LIS',
    title: 'Dãy con tăng dài nhất (Longest Increasing Subsequence)',
    difficulty: 'Trung bình',
    category: 'Quy hoạch động',
    timeLimitSeconds: 1.0,
    memoryLimitMB: 256,
    tags: ['DP', 'Binary Search', 'VNOI', 'VOI'],
    source: 'VNOI / SPOJ VN',
    solvedCount: 1420,
    totalSubmissions: 3105,
    author: 'VNOI Community',
    statement: `Cho một dãy gồm $N$ số nguyên $A = (a_1, a_2, \\dots, a_N)$.

Một dãy con của $A$ là dãy thu được bằng cách xóa đi $0$ hoặc nhiều phần tử khỏi $A$ mà không làm thay đổi thứ tự tương đối của các phần tử còn lại.

Dãy con được gọi là **tăng nghiêm ngặt** nếu mỗi phần tử trong dãy con đều lớn hơn phần tử đứng ngay trước nó.

**Yêu cầu:** Hãy tìm độ dài của dãy con tăng nghiêm ngặt dài nhất trong dãy $A$.`,
    inputSpec: `- Dòng đầu tiên chứa số nguyên $N$ ($1 \\le N \\le 30000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \\dots, a_N$ ($-10^9 \\le a_i \\le 10^9$), phân tách nhau bởi dấu cách.`,
    outputSpec: `In ra một số nguyên duy nhất là độ dài của dãy con tăng nghiêm ngặt dài nhất.`,
    constraints: `- Subtask 1 (40% điểm): $N \\le 1000$ (Thuật toán $O(N^2)$).
- Subtask 2 (60% điểm): $N \\le 30000$ (Thuật toán $O(N \\log N)$ kết hợp Binary Search hoặc Fenwick/Segment Tree).`,
    sampleTestCases: [
      {
        id: 'lis_sample_1',
        isSample: true,
        input: `6
1 2 5 4 6 2`,
        expectedOutput: `4`,
        explanation: `Dãy con tăng dài nhất là [1, 2, 5, 6] hoặc [1, 2, 4, 6] có độ dài bằng 4.`
      },
      {
        id: 'lis_sample_2',
        isSample: true,
        input: `5
5 4 3 2 1`,
        expectedOutput: `1`,
        explanation: `Dãy giảm dần nên dãy con tăng chỉ có độ dài tối đa là 1.`
      }
    ],
    hiddenTestCases: [
      {
        id: 'lis_hidden_1',
        input: `8
10 9 2 5 3 7 101 18`,
        expectedOutput: `4`,
        points: 20
      },
      {
        id: 'lis_hidden_2',
        input: `1
100`,
        expectedOutput: `1`,
        points: 20
      },
      {
        id: 'lis_hidden_3',
        input: `10
1 3 5 7 9 2 4 6 8 10`,
        expectedOutput: `6`,
        points: 20
      },
      {
        id: 'lis_hidden_4',
        input: `7
7 7 7 7 7 7 7`,
        expectedOutput: `1`,
        points: 20
      },
      {
        id: 'lis_hidden_5',
        input: `12
3 10 2 1 20 4 6 7 30 21 50 41`,
        expectedOutput: `7`,
        points: 20
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    if (!(cin >> n)) return 0;
    vector<int> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
    }

    // Code giải LIS của bạn ở đây:
    vector<int> tail;
    for (int x : a) {
        auto it = lower_bound(tail.begin(), tail.end(), x);
        if (it == tail.end()) {
            tail.push_back(x);
        } else {
            *it = x;
        }
    }

    cout << tail.size() << "\\n";
    return 0;
}`,
      python: `import sys
import bisect

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    a = [int(x) for x in input_data[1:n+1]]

    tail = []
    for x in a:
        idx = bisect.bisect_left(tail, x)
        if idx == len(tail):
            tail.append(x)
        else:
            tail[idx] = x

    print(len(tail))

if __name__ == '__main__':
    solve()`,
      java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        if (line == null) return;
        int n = Integer.parseInt(line.trim());
        StringTokenizer st = new StringTokenizer(br.readLine());
        int[] a = new int[n];
        for (int i = 0; i < n; i++) {
            a[i] = Integer.parseInt(st.nextToken());
        }

        ArrayList<Integer> tail = new ArrayList<>();
        for (int x : a) {
            int idx = Collections.binarySearch(tail, x);
            if (idx < 0) idx = -(idx + 1);
            if (idx == tail.size()) tail.add(x);
            else tail.set(idx, x);
        }

        System.out.println(tail.size());
    }
}`
    },
    solutionExplanation: `Sử dụng mảng tail với tìm kiếm nhị phân (Binary Search / std::lower_bound):
- tail[i] lưu giá trị nhỏ nhất của phần tử kết thúc một dãy con tăng có độ dài i + 1.
- Duyệt qua từng phần tử x của dãy ban đầu:
  + Tìm vị trí idx trong tail sao cho tail[idx] >= x.
  + Nếu tìm thấy, cập nhật tail[idx] = x để tạo cơ hội nối dài dãy sau này.
  + Nếu không tìm thấy (x lớn hơn tất cả phần tử trong tail), thêm x vào cuối tail.
- Độ dài của tail chính là đáp án cần tìm. Độ phức tạp: O(N log N).`
  },
  {
    id: 'oj_prime1',
    code: 'SPOJ_PRIME1',
    title: 'PRIME1 - Dãy số nguyên tố trong đoạn [M, N]',
    difficulty: 'Dễ',
    category: 'Toán học',
    timeLimitSeconds: 1.0,
    memoryLimitMB: 256,
    tags: ['Math', 'Sieve', 'SPOJ', 'Number Theory'],
    source: 'SPOJ Classic',
    solvedCount: 2840,
    totalSubmissions: 5690,
    author: 'SPOJ Team',
    statement: `Peter muốn tạo một hệ thống mã hóa mới sử dụng các số nguyên tố. Anh ấy cần một danh sách các số nguyên tố nằm trong đoạn $[M, N]$.

**Nhiệm vụ của bạn:** Với mỗi cặp số $M$ và $N$, hãy in ra tất cả các số nguyên tố $p$ thỏa mãn $M \\le p \\le N$.`,
    inputSpec: `Dòng đầu tiên chứa số nguyên $T$ ($T \\le 10$) là số lượng bộ test.
Mỗi test gồm 2 số nguyên $M$ và $N$ ($1 \\le M \\le N \\le 10^9, N - M \\le 10^5$) trên một dòng.`,
    outputSpec: `Đối với mỗi bộ test, in ra các số nguyên tố theo thứ tự tăng dần, mỗi số trên một dòng. Sau mỗi bộ test, in một dòng trống.`,
    constraints: `$1 \\le T \\le 10$
$1 \\le M \\le N \\le 10^9$
$N - M \\le 10^5$`,
    sampleTestCases: [
      {
        id: 'prime_sample_1',
        isSample: true,
        input: `2
1 10
3 5`,
        expectedOutput: `2
3
5
7

3
5`,
        explanation: `Test 1: trong đoạn [1, 10] có các số nguyên tố: 2, 3, 5, 7.
Test 2: trong đoạn [3, 5] có các số nguyên tố: 3, 5.`
      }
    ],
    hiddenTestCases: [
      {
        id: 'prime_hidden_1',
        input: `1
10 20`,
        expectedOutput: `11
13
17
19`,
        points: 30
      },
      {
        id: 'prime_hidden_2',
        input: `1
1 2`,
        expectedOutput: `2`,
        points: 35
      },
      {
        id: 'prime_hidden_3',
        input: `1
90 100`,
        expectedOutput: `97`,
        points: 35
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

bool isPrime(long long n) {
    if (n < 2) return false;
    if (n == 2 || n == 3) return true;
    if (n % 2 == 0 || n % 3 == 0) return false;
    for (long long i = 5; i * i <= n; i += 6) {
        if (n % i == 0 || n % (i + 2) == 0) return false;
    }
    return true;
}

void solve() {
    long long m, n;
    cin >> m >> n;
    for (long long i = m; i <= n; ++i) {
        if (isPrime(i)) {
            cout << i << "\\n";
        }
    }
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int t;
    if (cin >> t) {
        while (t--) {
            solve();
            if (t > 0) cout << "\\n";
        }
    }
    return 0;
}`,
      python: `import sys

def is_prime(n):
    if n < 2:
        return False
    if n in (2, 3):
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False
    i = 5
    while i * i <= n:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    t = int(input_data[0])
    idx = 1
    for k in range(t):
        m = int(input_data[idx])
        n = int(input_data[idx+1])
        idx += 2
        for num in range(m, n + 1):
            if is_prime(num):
                print(num)
        if k < t - 1:
            print()

if __name__ == '__main__':
    main()`
    }
  },
  {
    id: 'oj_knapsack',
    code: 'VOI_KNAPSACK',
    title: 'Bài toán Cái túi 0/1 (0-1 Knapsack Problem)',
    difficulty: 'Trung bình',
    category: 'Quy hoạch động',
    timeLimitSeconds: 1.0,
    memoryLimitMB: 256,
    tags: ['DP', 'Knapsack', 'VOI', 'Classic'],
    source: 'Kỳ thi HSG Quốc Gia (VOI)',
    solvedCount: 1980,
    totalSubmissions: 4210,
    author: 'VOI Editorial',
    statement: `Một tên trộm đột nhập vào một cửa hàng trang sức và mang theo một chiếc ba lô có thể chứa tối đa khối lượng là $W$.

Trong cửa hàng có $N$ món đồ quý. Món đồ thứ $i$ có khối lượng là $w_i$ và giá trị là $v_i$. Tên trộm chỉ có thể chọn hoặc không chọn mỗi món đồ (mỗi món đồ chỉ có 1 chiếc duy nhất).

**Yêu cầu:** Hãy tính tổng giá trị lớn nhất mà tên trộm có thể mang về mà không làm quá tải trọng $W$ của ba lô.`,
    inputSpec: `- Dòng đầu tiên chứa hai số nguyên $N$ và $W$ ($1 \\le N \\le 100, 1 \\le W \\le 10000$).
- $N$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $w_i$ và $v_i$ ($1 \\le w_i \\le W, 1 \\le v_i \\le 10^6$).`,
    outputSpec: `In ra một số nguyên duy nhất là tổng giá trị lớn nhất thu được.`,
    constraints: `$1 \\le N \\le 100$
$1 \\le W \\le 10000$
$1 \\le w_i \\le W, 1 \\le v_i \\le 10^6$`,
    sampleTestCases: [
      {
        id: 'knap_sample_1',
        isSample: true,
        input: `4 7
1 1
3 4
4 5
5 7`,
        expectedOutput: `9`,
        explanation: `Chọn đồ vật 2 (nặng 3, giá trị 4) và đồ vật 3 (nặng 4, giá trị 5). Tổng khối lượng = 3 + 4 = 7 <= 7, tổng giá trị = 4 + 5 = 9.`
      }
    ],
    hiddenTestCases: [
      {
        id: 'knap_hidden_1',
        input: `3 4
1 1500
3 2000
4 3000`,
        expectedOutput: `3500`,
        points: 25
      },
      {
        id: 'knap_hidden_2',
        input: `1 10
5 500`,
        expectedOutput: `500`,
        points: 25
      },
      {
        id: 'knap_hidden_3',
        input: `5 10
2 6
2 10
3 12
4 16
5 20`,
        expectedOutput: `42`,
        points: 25
      },
      {
        id: 'knap_hidden_4',
        input: `3 3
4 100
5 200
6 300`,
        expectedOutput: `0`,
        points: 25
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n, W;
    if (!(cin >> n >> W)) return 0;

    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; ++i) {
        int w, v;
        cin >> w >> v;
        for (int j = W; j >= w; --j) {
            dp[j] = max(dp[j], dp[j - w] + v);
        }
    }

    cout << dp[W] << "\\n";
    return 0;
}`,
      python: `import sys

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    W = int(input_data[1])
    dp = [0] * (W + 1)
    idx = 2
    for _ in range(n):
        w = int(input_data[idx])
        v = int(input_data[idx + 1])
        idx += 2
        for j in range(W, w - 1, -1):
            if dp[j - w] + v > dp[j]:
                dp[j] = dp[j - w] + v

    print(dp[W])

if __name__ == '__main__':
    solve()`
    }
  },
  {
    id: 'oj_summax',
    code: 'VNOI_MAXSUB',
    title: 'Tổng dãy con liên tiếp lớn nhất (Maximum Subarray Sum)',
    difficulty: 'Dễ',
    category: 'Quy hoạch động',
    timeLimitSeconds: 1.0,
    memoryLimitMB: 256,
    tags: ['Kadane', 'Greedy', 'DP', 'Array'],
    source: 'VNOI Foundation',
    solvedCount: 3510,
    totalSubmissions: 5800,
    author: 'VNOI',
    statement: `Cho một mảng $A$ gồm $N$ số nguyên ($a_1, a_2, \\dots, a_N$).

Một dãy con liên tiếp của $A$ là dãy gồm các phần tử $(a_i, a_{i+1}, \\dots, a_j)$ với $1 \\le i \\le j \\le N$.

**Yêu cầu:** Hãy tìm tổng lớn nhất của một dãy con liên tiếp không rỗng trong mảng $A$.`,
    inputSpec: `- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \\le N \\le 10^5$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \\dots, a_N$ ($-10^9 \\le a_i \\le 10^9$).`,
    outputSpec: `In ra một số nguyên duy nhất là tổng lớn nhất tìm được.`,
    constraints: `$1 \\le N \\le 10^5$
$-10^9 \\le a_i \\le 10^9$`,
    sampleTestCases: [
      {
        id: 'maxsub_sample_1',
        isSample: true,
        input: `8
-2 -3 4 -1 -2 1 5 -3`,
        expectedOutput: `7`,
        explanation: `Dãy con liên tiếp [4, -1, -2, 1, 5] có tổng lớn nhất là 4 + (-1) + (-2) + 1 + 5 = 7.`
      }
    ],
    hiddenTestCases: [
      {
        id: 'maxsub_hidden_1',
        input: `4
-5 -2 -8 -1`,
        expectedOutput: `-1`,
        points: 30
      },
      {
        id: 'maxsub_hidden_2',
        input: `5
1 2 3 4 5`,
        expectedOutput: `15`,
        points: 35
      },
      {
        id: 'maxsub_hidden_3',
        input: `1
-10`,
        expectedOutput: `-10`,
        points: 35
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    if (!(cin >> n)) return 0;
    long long current_sum = 0;
    long long max_sum = -1e18;

    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        current_sum = max(x, current_sum + x);
        max_sum = max(max_sum, current_sum);
    }

    cout << max_sum << "\\n";
    return 0;
}`,
      python: `import sys

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    a = [int(x) for x in input_data[1:n+1]]

    max_sum = -float('inf')
    current_sum = 0
    for x in a:
        current_sum = max(x, current_sum + x)
        max_sum = max(max_sum, current_sum)

    print(max_sum)

if __name__ == '__main__':
    solve()`
    }
  },
  {
    id: 'oj_twoptr',
    code: 'VNOI_2SUM',
    title: 'Tìm cặp số có tổng bằng K (Two Sum Pairs)',
    difficulty: 'Dễ',
    category: 'Tham lam',
    timeLimitSeconds: 1.0,
    memoryLimitMB: 256,
    tags: ['Two Pointers', 'Sorting', 'Hash Map', 'Search'],
    source: 'VNOI / Codeforces Div 2',
    solvedCount: 2210,
    totalSubmissions: 3950,
    author: 'VNOI',
    statement: `Cho một dãy gồm $N$ số nguyên phân biệt đã được sắp xếp tăng dần $a_1 < a_2 < \\dots < a_N$ và một số nguyên mục tiêu $K$.

**Yêu cầu:** Hãy đếm số lượng cặp chỉ số $(i, j)$ với $1 \\le i < j \\le N$ sao cho $a_i + a_j = K$.`,
    inputSpec: `- Dòng đầu tiên chứa hai số nguyên $N$ và $K$ ($2 \\le N \\le 10^5, -10^9 \\le K \\le 10^9$).
- Dòng thứ hai chứa $N$ số nguyên đã sắp xếp tăng dần $a_1, a_2, \\dots, a_N$ ($-10^9 \\le a_i \\le 10^9$).`,
    outputSpec: `In ra số lượng cặp $(i, j)$ thỏa mãn điều kiện.`,
    constraints: `$2 \\le N \\le 10^5$
$-10^9 \\le a_i, K \\le 10^9$`,
    sampleTestCases: [
      {
        id: '2sum_sample_1',
        isSample: true,
        input: `6 8
1 2 4 6 7 10`,
        expectedOutput: `2`,
        explanation: `Các cặp có tổng bằng 8 là: (1, 7) và (2, 6).`
      }
    ],
    hiddenTestCases: [
      {
        id: '2sum_hidden_1',
        input: `4 10
1 3 5 7`,
        expectedOutput: `1`,
        points: 50
      },
      {
        id: '2sum_hidden_2',
        input: `5 100
10 20 30 40 50`,
        expectedOutput: `0`,
        points: 50
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    long long k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    int left = 0, right = n - 1;
    long long count = 0;
    while (left < right) {
        long long sum = a[left] + a[right];
        if (sum == k) {
            count++;
            left++;
            right--;
        } else if (sum < k) {
            left++;
        } else {
            right--;
        }
    }

    cout << count << "\\n";
    return 0;
}`,
      python: `import sys

def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2:n+2]]

    left = 0
    right = n - 1
    cnt = 0
    while left < right:
        s = a[left] + a[right]
        if s == k:
            cnt += 1
            left += 1
            right -= 1
        elif s < k:
            left += 1
        else:
            right -= 1
    print(cnt)

if __name__ == '__main__':
    main()`
    }
  },
  {
    id: 'oj_dijkstra',
    code: 'VNOI_QHEAVY',
    title: 'Đường đi ngắn nhất trên đồ thị (Dijkstra Shortest Path)',
    difficulty: 'Khó',
    category: 'Đồ thị',
    timeLimitSeconds: 1.5,
    memoryLimitMB: 256,
    tags: ['Graph', 'Dijkstra', 'Priority Queue', 'Shortest Path'],
    source: 'VNOI National',
    solvedCount: 890,
    totalSubmissions: 2450,
    author: 'VNOI Team',
    statement: `Cho một đồ thị có hướng gồm $N$ đỉnh (được đánh số từ $1$ đến $N$) và $M$ cung có trọng số dương.

**Yêu cầu:** Hãy tìm độ dài đường đi ngắn nhất từ đỉnh xuất phát $S$ đến tất cả các đỉnh còn lại từ $1$ đến $N$. Nếu không có đường đi đến đỉnh $u$, in ra $-1$.`,
    inputSpec: `- Dòng đầu tiên chứa ba số nguyên $N, M, S$ ($1 \\le N \\le 10^5, 1 \\le M \\le 2 \\times 10^5, 1 \\le S \\le N$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ đại diện cho một cung từ $u$ đến $v$ với độ dài $w$ ($1 \\le u, v \\le N, 1 \\le w \\le 10^9$).`,
    outputSpec: `In ra $N$ số nguyên trên một dòng, số thứ $i$ là khoảng cách ngắn nhất từ $S$ đến đỉnh $i$.`,
    constraints: `$1 \\le N \\le 10^5$
$1 \\le M \\le 2 \\times 10^5$
$1 \\le w \\le 10^9$`,
    sampleTestCases: [
      {
        id: 'dijk_sample_1',
        isSample: true,
        input: `4 4 1
1 2 2
1 3 5
2 3 1
3 4 3`,
        expectedOutput: `0 2 3 6`,
        explanation: `Từ đỉnh 1:
Đến đỉnh 1: khoảng cách 0
Đến đỉnh 2: 1 -> 2 (chi phí 2)
Đến đỉnh 3: 1 -> 2 -> 3 (chi phí 2 + 1 = 3)
Đến đỉnh 4: 1 -> 2 -> 3 -> 4 (chi phí 3 + 3 = 6)`
      }
    ],
    hiddenTestCases: [
      {
        id: 'dijk_hidden_1',
        input: `3 2 1
1 2 10
2 3 5`,
        expectedOutput: `0 10 15`,
        points: 50
      },
      {
        id: 'dijk_hidden_2',
        input: `3 1 1
1 2 5`,
        expectedOutput: `0 5 -1`,
        points: 50
      }
    ],
    starterCodes: {
      cpp: `#include <bits/stdc++.h>
using namespace std;

const long long INF = 1e18;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n, m, s;
    if (!(cin >> n >> m >> s)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
    }

    vector<long long> dist(n + 1, INF);
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<pair<long long, int>>> pq;

    dist[s] = 0;
    pq.push({0, s});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();

        if (d > dist[u]) continue;

        for (auto& edge : adj[u]) {
            int v = edge.first;
            long long w = edge.second;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }

    for (int i = 1; i <= n; ++i) {
        if (dist[i] == INF) cout << -1 << (i == n ? "" : " ");
        else cout << dist[i] << (i == n ? "" : " ");
    }
    cout << "\\n";
    return 0;
}`,
      python: `import sys
import heapq

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    m = int(input_data[1])
    s = int(input_data[2])

    adj = [[] for _ in range(n + 1)]
    idx = 3
    for _ in range(m):
        u = int(input_data[idx])
        v = int(input_data[idx + 1])
        w = int(input_data[idx + 2])
        idx += 3
        adj[u].append((v, w))

    INF = float('inf')
    dist = [INF] * (n + 1)
    dist[s] = 0
    pq = [(0, s)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(pq, (dist[v], v))

    res = []
    for i in range(1, n + 1):
        res.append(str(dist[i]) if dist[i] != INF else "-1")
    print(" ".join(res))

if __name__ == '__main__':
    main()`
    }
  }
];
