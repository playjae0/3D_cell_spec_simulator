# Windows 시험판 재현

요소기술 작업 병합 기준선은 `e3af45a02045111c79ec38d3172785ce7631a277` (PR #11)이다. 제조 형상과 정확도는 그대로 두고 기존 `cad/server.py`, 일반 Vite 빌드, intake 검증/어댑터/모델 보관함을 재사용한다.

## 수동 빌드

GitHub → Actions → **Core and intake regression** → **Run workflow**에서 패키징 코드가 있는 브랜치를 선택하고 `target_ref`에 만들 브랜치·태그·커밋을 입력한다. 실제 체크아웃한 SHA가 두 ZIP, VERSION.json, 파일 해시 목록과 보고서에 기록된다. push/PR 검증은 기존 Linux 회귀만 수행한다. Windows 빌드는 수동 실행에서만 수행한다.

```sh
gh workflow run validation.yml --ref feat/windows-trial -f target_ref=feat/windows-trial
gh run list --workflow validation.yml --event workflow_dispatch
gh run download <RUN_ID> --dir downloaded
```

기본 브랜치 병합 후에는 `--ref main`을 쓴다. 과거 커밋에 패키징 코드가 없으면 그 커밋은 패키징할 수 없으며 성공한 산출물로 표시하지 않는다. Actions 산출물의 보존 기간은 30일이다. 승인된 공유 경로에 동일 ZIP을 복사할 수 있다. 공개 Release 게시와 사내 자료 업로드는 하지 않는다.

Windows 개발 PC에서 수동 재현할 때는 Node 22, Python 3.12.10 x64, Git을 사용한다. 작업 트리가 깨끗한 커밋에서 `npm ci`, `npm test`, `npm run build`, `python -m pip install pyinstaller==6.16.0`, `npm run build:windows` 순서로 실행한다. 재빌드는 새 checkout/작업 폴더를 사용한다. 입력키트만 다시 만들 때는 `npm run build:intake-kit`을 사용한다. 일반 `scripts/start.*`와 `dist/`, 정적 프리뷰 빌드는 그대로다.

## 구성과 크기

런처는 표준 라이브러리만 사용하는 작은 PyInstaller EXE다. CAD는 동봉 CPython 3.12.10 embeddable 런타임의 `-I -X utf8` 격리 모드로 실행한다. CadQuery/OCP의 동적 확장과 네이티브 DLL을 일반 wheel 디렉터리에 보존하므로 CAD 패키지의 freeze 누락을 피한다. Python/Node/CadQuery를 현업 PC에 설치하지 않는다. EXE는 127.0.0.1에만 바인드하는 기존 CAD 서버를 자식 프로세스로 실행하며, Windows Job Object로 런처 종료 시 자식도 종료한다. 동일 포트를 유지해 브라우저 보관함 원점을 유지한다.

포장 허용 목록은 일반 `dist`, `cad/*.py`, `src/data/stages.json`, 런타임/wheel, 버전/파일 목록, 사용 안내와 라이선스 고지다. 저장소 전체를 복사하지 않는다. 조사 자료, 사진, 과거 ZIP, 개발 캡처, 사용자 모델, 프리뷰 기록은 포함하지 않는다. 저장소 원본 파일을 삭제하지 않는다. 실제 크기·큰 파일·포함 이유는 `size-report.json`, 개별 파일 해시는 배포본 `FILE-MANIFEST.json`에 있다. CPython 다운로드 출처와 원문 해시도 VERSION.json에 기록한다.

## 입력 감사 범위

기존 1.0~1.3 양식과 1.3 공구 스냅샷을 유지한다. 새 1.4 양식은 기존 parameters 표/출처/단위/검토 로직에 공구 필드를 추가한다. 구조에만 있는 ID와 버전을 제외하고 공구 값은 parameters에서만 관리한다. `processTooling`은 null 구조이며, 누락값에 예시 숫자를 넣지 않는다. 최신 bodyDepth/foilCut, 독립 극·공구 개정·배치, 실링 윤곽·절단/접힘선, 기존 파우치 치수와 검사 데이텀을 저장한다. 공구 추가·배열 구조 변경 시 새 ID의 입력과 검토가 필요하다.

`reviewCsv()`는 앱의 현재 JSON과 빌드의 가상 JSON에 공통 사용한다. CSV가 기준 데이터로 역수입되지는 않는다. 필드 사전의 기준과 JSON의 문서 위치를 담당자가 함께 검토한다. 1.4에서는 활성 공정 외 공구까지 전체 구성의 명시적 검토를 요구한다. 기존 부분 공정용 1.2 양식의 null 동작은 유지한다.

## 검증 구분

1. 개발 환경: JS/CAD 회귀, 일반 웹 빌드, 기존 입력/단위/누락 오류, 새 필드 왕복, 실제 서버 UI 저장/재열기.
2. Windows 빌드 러너: EXE/런타임/웹/키트 ZIP 생성. 이것만으로 실행 성공으로 판정하지 않는다.
3. 별도 Windows 러너: 앞 단계 산출물 ZIP을 다운로드해 한글·공백 경로에 압축 해제. 앱 PATH에서 시스템 개발 도구를 제외하고, Windows 방화벽으로 외부 송신을 차단한 동안 EXE→가상 입력→3→4 mm 실제 CAD→저장→종료→재실행→새 브라우저 프로필에서 셀 파일 복원을 시험한다. 포트 충돌/외부 웹 요청/콘솔 오류/반대극 보존을 기록한다. 테스트 자동화에만 호스트 Python/Playwright를 사용하며 앱이 사용하지 않는다.
4. **개발 도구가 전혀 없는 깨끗한 Windows 이미지와 사내 정책 PC는 별도 검증**이다. GitHub 호스팅 러너에는 개발 도구가 미리 설치되어 있으므로 3번을 4번으로 보고하지 않는다. 사내 마지막 시험은 배포 ZIP의 시작 안내를 따른다.

코드 서명, 설치 관리자, 자동 업데이트, 도면 PDF/비전 입력은 이번 시험판에 없다. 셀 JSON은 현재 모델과 설정을 복원한다. 전체 브라우저 모델/개정/실측 이력은 별도 보관함 백업으로 관리한다.
