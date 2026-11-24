# 각형 반제품과 완성 외관 검수

제품 공정도 전체보기의 다섯 카드는 같은 제품과 개정을 사용한다. 카드 아래 **병행 준비 · 캡 조립체 보기**에서 스택과 별도로 캡을 살펴볼 수 있다. 전체보기·단품·공정 상세 모두 같은 CAD 부품 ID와 형상을 사용한다.

## 제조사 그림과 CAD 대응

제조사 그림에서는 한쪽 좁은 끝의 금속 다발, 캡의 양 끝 돌출부, 중앙 윤곽, 탭과 집전체의 용접 구역, 삽입 후 캡이 드러난 완성 외관을 확인할 수 있다. 원문 JPG 주소는 이번 접속에서 오류 HTML을 반환했다. 제공된 도면 PDF에서 다시 인코딩하지 않고 추출한 삼성SDI 그림 E1·E2·E3·E4를 직접 열어 캡이 위, 관찰된 탭 끝이 오른쪽인 방향으로 대조했다. [스택 원문](https://news.samsungsdi.com/global/articleView?seq=298) · [조립 원문](https://news.samsungsdi.com/global/articleView?seq=310) · [탭 용접 그림](https://news.samsungsdi.com/data_assets/global/editors/20260623173951_.jpg) · [삽입·둘레 용접 그림](https://news.samsungsdi.com/data_assets/global/editors/20260623174003_.jpg)

파우치의 `cad/model.py`에서 `build_raw_pole`의 분포 단면, `build_pole`의 위치별 단면 연결과 유한한 집속·접합 영역을 확인했다. `src/components/workbench.js`의 단품 선택과 같이 각형 단품도 공정 CAD 응답에서 자기 부품 ID를 골라 표시한다. 아래의 측면 집전체와 캡 상면 터미널은 각형 전용 형상이다.

| 공정 | 실제 브라우저 화면 | 볼 부위 |
|---|---|---|
| ① 스택 준비 | [전체](review/01-stack.png) · [포일 끝 확대](review/01b-foil.png) | 적층 몸체, 뿌리, 폭이 모이는 전이 구간과 자유단 |
| 병행 준비 · 캡 | [상면](review/cap-top.png) · [하면](review/cap-underside.png) · [하면 확대](review/cap-underside-detail.png) | 독립 터미널 A/B, 중앙 윤곽, 아래 한쪽 집전체 |
| ② 탭–캡 집전체 접합 | [전체](review/02-joined.png) · [용접 전 확대](review/02a-before.png) · [용접 후 확대](review/02b-after.png) · [접촉면 투시](review/02c-interface.png) | 용접 전에는 캡 측을 X/Z로 각각 10 mm 벌려 표시한다. 접합 후에는 J_X와 자유단이 만나며 유한한 접촉 범위와 외측 접합 표시를 따로 고를 수 있다. |
| ③ 5면 절연 | [피복 후](review/03-insulated.png) · [같은 시점의 피복 전](review/03b-bare.png) · [바닥](review/03c-bottom.png) · [상면](review/03d-open-top.png) | 바닥과 네 측면에 피복이 있고 상면은 노출된다. **상면 확인 · 캡 숨김**은 캡 조립체의 표시만 전환한다. |
| ④ 캔 삽입·캡 안착 | [빈 캔](review/04a-empty.png) · [직전 95 mm](review/04b-approach.png) · [중간 45 mm](review/04c-middle.png) · [안착](review/04-seated.png) | 같은 캡·터미널·집전체·탭·스택·절연이 강체로 내려간다. A01에서 캡 하면과 림을, A06에서 양쪽 바닥을 확인한다. |
| ⑤ 캔–캡 둘레 용접 | [완성 외관](review/05-finished.png) · [둘레 확대](review/05b-perimeter.png) | 양 끝 터미널이 남아 있다. **내부 접합 확인**으로 외장·절연을 숨기면 내부 탭 접합으로 전환한다. |

## 데이텀, 치수와 가정

- 스택 상면과 양 중심면이 기준이다. `stack`, `foil-root`, `foil-gather`, `tab`은 대표 단면을 연결한다. 일곱 띠, 뿌리가 드러나는 폭, 모델용 단면 완화량은 시각적 예시다. 실제 층수·포일 장수와 물리적 변형은 미확인이다.
- 캡의 `cap`은 플레이트 단품이다. K03의 양끝은 플레이트 밑면과 윗면이다. 터미널 A(T01–T05), B(T06–T10)는 각각 캡 중심 기준 X/Y, 베이스 외곽 길이·폭, 캡 상면 기준 높이를 한 곳에서 입력한다. 단차 베이스·얕은 상부 홈·중앙 윤곽의 높이와 라운드는 가상 형상이다. 터미널의 극성, 체결 공법, 중앙 윤곽의 기능과 숨은 도전 경로는 미확인이다.
- `collector`는 캡 하면에서 내려오는 유한 두께 단품이다. 기존 K04/J_X는 탭 쪽 지정 면, K05–K07은 이 면의 접촉대이다. K08은 J_X에서 외측으로 잰 모델 두께다. J04/J05는 두 접촉대의 높이·폭 겹침이며, `contact`는 교집합 면, `joint`는 같은 위치를 집전체 외면에 표시한 영역이다. 실제 레이저 자국·용입·이면 집전체는 미확인이다.
- `insulation`은 스택 외곽에 종속된 상면 개방 5면 외피다. 자유단 통과부 개구는 모델용 단순화다. `can`은 바닥이 있는 직벽 중공체다. `weld`는 N_A에서의 W01 표시 띠다. 생산 비드, 모서리 변형·공차를 포함한 생산 삽입성은 검증 범위 밖이다.
- 구버전 각형 입력 25개를 열면 11개 하드웨어 가상 기본값을 보충한다. 새 필드가 일부만 있거나 유한수가 아니면 오류를 표시한다. **치수·라벨**을 꺼도 부품 선택과 확대를 사용할 수 있다.

## 변경시험과 재현

부품·요소기술 → 터미널 A에서 T05를 4→5 mm로 변경한다. 기본 안착 자세에서 터미널 A 상단 Z는 6→7 mm, 밑면은 Z=2 mm다. 동작 검사는 접합부터 완성까지 네 공정의 CAD 부품을 ID별로 대조한다. 반대 터미널 높이 4 mm, K03 2 mm, 림 Z=0, 안착 바닥 간극 1.75 mm가 유지된다.

A01이 95 / 45 / 0 mm일 때 현재 바닥 간극은 각각 96.75 / 46.75 / 1.75 mm다. A06 항목의 설계값은 안착 기준 1.75 mm이고, 항목을 선택하면 3D 양끝과 레이블은 현재 위치의 실제 간극을 보여준다. K08을 0.8→2.5 mm로 키우면 접촉 기준면 여유 A07은 2 mm 그대로지만, 집전체 외측은 캔 내측 +X 방향으로 0.50 mm 간섭하여 안착 승인이 차단된다.

기존 다섯 계산 사례는 각각 원래 기본값에서 시작한다. 브라우저 시험 명령은 아래와 같다. 두 번째 명령은 정적 서버가 제공하는 프리뷰에 같은 조작을 수행하며 편집 잠금과 CAD POST 0건을 검사한다.

```sh
python scripts/check_prismatic_assembly.py http://127.0.0.1:8765 /tmp/prism-live --chromium /usr/bin/chromium
python scripts/check_prismatic_assembly.py http://127.0.0.1:8010 /tmp/prism-preview --preview --chromium /usr/bin/chromium
```
