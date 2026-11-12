-- M4b 시드: 3단계 TIP 1개(역·초등학교 거리 입력이 같이 쓴다). 법령 근거가 없어 source는 null.
insert into public.tips (slug, stage, field_key, title, body, caution, sort_order, source) values
  ('straight-line-distance', 3, 'station_distance_max_m', '직선거리와 실제 거리',
   E'- 직선거리는 지도 위 두 점 사이의 가장 짧은 거리입니다.\n- 실제로 걷는 길은 도로, 횡단보도, 출입구 위치 때문에 보통 직선거리보다 깁니다.\n- 이 서비스의 역·학교 거리는 모두 직선거리입니다.',
   '역 출입구와 단지 출입구 위치에 따라 체감 거리가 크게 다를 수 있으니, 관심 단지는 지도 앱의 도보 경로로 꼭 확인하세요.',
   70, null);
-- 4단계 TIP의 "거리 데이터 없음" 문구는 이제 사실이 아니다
update public.tips set caution = '이 서비스의 역·학교 거리는 직선거리이며 실제 도보 거리는 더 깁니다. 생활 인프라와 출퇴근 시간은 직접 현장과 지도를 확인하세요.'
  where slug = 'location-and-price';
