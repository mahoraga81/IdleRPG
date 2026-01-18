#!/bin/bash
# 사용법: ./push.sh "여기에 커밋 메시지를 입력하세요"

# 커밋 메시지가 비어 있는지 확인
if [ -z "$1" ]; then
  echo "오류: 커밋 메시지를 입력해야 합니다."
  echo "사용법: ./push.sh "<커밋 메시지>""
  exit 1
fi

# 1. 모든 변경 사항을 스테이징합니다.
echo "git add . 실행 중..."
git add .

# 2. 제공된 메시지로 커밋합니다.
echo "git commit 실행 중..."
git commit -m "$1"

# 3. 'main' 브랜치로 푸시합니다.
echo "git push origin main 실행 중..."
git push origin main

echo "작업이 완료되었습니다!"
