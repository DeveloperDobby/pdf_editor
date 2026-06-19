# PDF 페이지 편집기

GitHub Pages에서 바로 배포할 수 있는 정적 PDF 편집 웹앱입니다. 서버 없이 브라우저에서만 PDF를 처리합니다.

## 바로가기

https://developerdobby.github.io/pdf_editor/

## 구현 기능

1. PDF 불러오기 후 페이지를 그리드/목록 형식으로 표시
2. 원하는 페이지 선택 삭제 후 새 PDF 다운로드
3. 원하는 페이지 개수 기준으로 PDF 분할
   - 예: 60페이지 PDF에서 10 입력 → 1-10, 11-20, 21-30, 31-40, 41-50, 51-60
4. 분할된 PDF들을 ZIP으로 압축하여 다운로드

## 파일 구조

```text
.
├── index.html
├── styles.css
├── app.js
├── .nojekyll
└── README.md
```

## GitHub Pages 배포 방법

1. 새 GitHub 저장소를 만듭니다.
2. 이 폴더의 파일을 저장소 루트에 업로드합니다.
3. 저장소의 `Settings` → `Pages`로 이동합니다.
4. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
5. Branch를 `main`, Folder를 `/root`로 선택하고 저장합니다.
6. 표시되는 GitHub Pages 주소로 접속합니다.

## 사용 라이브러리

- PDF 미리보기 렌더링: PDF.js
- PDF 페이지 복사/삭제/분할: pdf-lib
- ZIP 생성: JSZip

## 참고

대용량 PDF는 브라우저 메모리를 많이 사용할 수 있습니다. 아주 큰 파일의 경우 PC 브라우저 사용을 권장합니다.
