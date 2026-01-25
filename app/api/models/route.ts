// app/api/models/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // 1. public 폴더 경로 잡기
    const publicDirectory = path.join(process.cwd(), 'public');
    
    // 2. 폴더 내 파일 목록 읽기
    const filenames = fs.readdirSync(publicDirectory);
    
    // 3. .glb 파일만 필터링
    const glbFiles = filenames
      .filter((file) => file.toLowerCase().endsWith('.glb'))
      .map((file) => `/${file}`);

    return NextResponse.json(glbFiles);
  } catch (error) {
    console.error("모델 목록 읽기 실패:", error);
    return NextResponse.json({ error: "Failed to load models" }, { status: 500 });
  }
}