/** Claude のマーク（モデルの選択・使用枠・サブエージェントのアイコン） */
export function ClaudeMark({ size = 14 }: { size?: number }) {
  const rays = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {rays.map((deg, i) => (
        <rect key={deg} x="11" y={i % 2 ? 3.5 : 2} width="2" height={i % 2 ? 8.5 : 10} rx="1" fill="currentColor" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}
