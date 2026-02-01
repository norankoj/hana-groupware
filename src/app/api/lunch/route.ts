// src/app/api/lunch/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

  if (!KAKAO_KEY) {
    return NextResponse.json(
      { error: "카카오 키가 없습니다." },
      { status: 500 },
    );
  }

  try {
    // 1. 하나교회 좌표 (X: 경도, Y: 위도)
    const X = "127.071935";
    const Y = "37.245068";
    const RADIUS = "2000"; // 2km 반경

    // 2. 메뉴 키워드 리스트
    const menuKeywords = [
      "백반",
      "한식뷔페",
      "불백",
      "두루치기",
      "쌈밥",
      "보리밥",
      "생선구이",
      "솥밥",
      "비빔밥",
      "국밥",
      "순두부",
      "부대찌개",
      "김치찌개",
      "해장국",
      "뼈해장국",
      "콩나물국밥",
      "육개장",
      "제육볶음",
      "덮밥",
      "도시락",
      "컵밥",
      "카레",
      "짜장면",
      "중국집",
      "짬뽕",
      "칼국수",
      "쌀국수",
      "라멘",
      "우동",
      "마라탕",
      "수제비",
      "김밥",
      "분식",
      "떡볶이",
      "돈까스",
      "햄버거",
      "샌드위치",
      "토스트",
      "샐러드",
      "닭강정",
    ];

    // ★ [핵심 변경] 랜덤으로 3개의 키워드를 뽑습니다. (중복 방지)
    const selectedKeywords: string[] = [];
    while (selectedKeywords.length < 3) {
      const random =
        menuKeywords[Math.floor(Math.random() * menuKeywords.length)];
      if (!selectedKeywords.includes(random)) {
        selectedKeywords.push(random);
      }
    }

    // ★ [핵심 변경] 3개의 키워드를 '동시에(Parallel)' 검색합니다. (속도 저하 최소화)
    const fetchPromises = selectedKeywords.map((keyword) => {
      const query = encodeURIComponent(keyword);
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${query}&category_group_code=FD6&x=${X}&y=${Y}&radius=${RADIUS}&size=5&sort=accuracy`;

      return fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      }).then((res) => res.json());
    });

    // 3개 요청이 다 끝날 때까지 기다림
    const results = await Promise.all(fetchPromises);

    // 3. 결과 합치기 & 데이터 가공
    let allRestaurants: any[] = [];

    results.forEach((data) => {
      if (data.documents) {
        const places = data.documents.map((place: any) => {
          let icon = "🍽️";
          const categoryName = place.category_name;

          if (categoryName.includes("한식") || categoryName.includes("백반"))
            icon = "🍚";
          else if (categoryName.includes("중식")) icon = "🍜";
          else if (
            categoryName.includes("일식") ||
            categoryName.includes("초밥")
          )
            icon = "🍣";
          else if (
            categoryName.includes("양식") ||
            categoryName.includes("피자") ||
            categoryName.includes("버거")
          )
            icon = "🍔";
          else if (categoryName.includes("치킨")) icon = "🍗";
          else if (categoryName.includes("분식")) icon = "🍢";
          else if (categoryName.includes("카페")) icon = "☕";
          else if (
            categoryName.includes("아시아") ||
            categoryName.includes("국수")
          )
            icon = "🍜";
          else if (categoryName.includes("고기")) icon = "🥩";

          return {
            id: place.id,
            name: place.place_name,
            category: place.category_name.split(" > ").pop(),
            phone: place.phone,
            url: place.place_url,
            icon: icon,
            address: place.address_name.split(" ").slice(0, 3).join(" "),
          };
        });
        allRestaurants = [...allRestaurants, ...places];
      }
    });

    // 4. 결과 섞기 (Shuffle) - 국밥, 파스타, 짜장면이 마구 섞이도록
    allRestaurants.sort(() => Math.random() - 0.5);

    // 5. 중복 제거 (혹시 겹치는 가게가 있을 수 있으니 id로 거름)
    const uniqueRestaurants = Array.from(
      new Map(allRestaurants.map((item) => [item.id, item])).values(),
    );

    return NextResponse.json({
      restaurants: uniqueRestaurants,
      keyword: `${selectedKeywords.join(", ")} 등`, // 화면에 보여줄 멘트
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "데이터를 가져오는데 실패했습니다." },
      { status: 500 },
    );
  }
}
