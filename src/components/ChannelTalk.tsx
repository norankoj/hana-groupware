// src/components/ChannelTalk.tsx
"use client";

import { useEffect } from "react";
import * as ChannelService from "@channel.io/channel-web-sdk-loader";
import { createClient } from "@/utils/supabase/client";

export default function ChannelTalk() {
  const supabase = createClient();

  useEffect(() => {
    // 1. 채널톡 스크립트 로드
    ChannelService.loadScript();

    // 2. 사용자 정보 가져오기 (로그인 한 경우 정보 연동)
    const bootChannelTalk = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let profile = {};

      if (user) {
        // 프로필 정보 추가 조회
        const { data: userData } = await supabase
          .from("profiles")
          .select("full_name, phone, position")
          .eq("id", user.id)
          .single();

        if (userData) {
          profile = {
            memberId: user.id, // 회원 ID
            profile: {
              name: userData.full_name, // 이름
              mobileNumber: userData.phone, // 전화번호
              position: userData.position, // 직분
            },
          };
        }
      }

      // 3. 채널톡 시작 (Boot)
      ChannelService.boot({
        pluginKey: process.env.NEXT_PUBLIC_CHANNEL_IO_KEY || "", // .env에 키 저장 추천
        ...profile, // 로그인 정보가 있으면 같이 보냄
      });
    };

    bootChannelTalk();

    // 클린업: 컴포넌트가 사라질 때 채널톡 종료
    return () => {
      ChannelService.shutdown();
    };
  }, []);

  return null; // 화면에 아무것도 그리지 않음 (스크립트만 실행)
}
