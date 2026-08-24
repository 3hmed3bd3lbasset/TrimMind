import fs from 'fs';
import path from 'path';

// ============================================================================
// Enterprise Image Security & Magic Bytes Signature Verification Engine
// ============================================================================

export interface FileValidationResult {
  isValid: boolean;
  detectedMime: string | null;
  safeExt: string | null;
  rejectionReason?: string;
}

/**
 * Known Magic Byte File Signatures (Hex Headers)
 */
const MAGIC_SIGNATURES = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  WEBP_HEADER: [0x57, 0x45, 0x42, 0x50], // "WEBP" at offset 8
};

/**
 * Dangerous Script / Polyglot signatures to reject immediately
 */
const DANGEROUS_PATTERNS = [
  Buffer.from('<?php', 'ascii'),
  Buffer.from('<script', 'ascii'),
  Buffer.from('<?xml', 'ascii'),
  Buffer.from('<svg', 'ascii'),
  Buffer.from('eval(', 'ascii'),
  Buffer.from('/bin/sh', 'ascii'),
  Buffer.from('/bin/bash', 'ascii'),
];

/**
 * Performs Deep Packet & Magic Bytes Inspection on uploaded file buffers
 */
export function validateImageSignature(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length < 12) {
    return { isValid: false, detectedMime: null, safeExt: null, rejectionReason: 'حجم الملف صغير جداً أو تالف' };
  }

  // 1. Polyglot / WebShell Injection Scan (First 1KB)
  const headerSample = buffer.subarray(0, Math.min(buffer.length, 1024));
  for (const pattern of DANGEROUS_PATTERNS) {
    if (headerSample.includes(pattern)) {
      return {
        isValid: false,
        detectedMime: null,
        safeExt: null,
        rejectionReason: 'تم رفض الملف: يحتوي على توقيع برمجي خبيث محظور (Polyglot/Script Detected)',
      };
    }
  }

  // 2. Check JPEG (FF D8 FF)
  if (
    buffer[0] === MAGIC_SIGNATURES.JPEG[0] &&
    buffer[1] === MAGIC_SIGNATURES.JPEG[1] &&
    buffer[2] === MAGIC_SIGNATURES.JPEG[2]
  ) {
    return { isValid: true, detectedMime: 'image/jpeg', safeExt: '.jpg' };
  }

  // 3. Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === MAGIC_SIGNATURES.PNG[0] &&
    buffer[1] === MAGIC_SIGNATURES.PNG[1] &&
    buffer[2] === MAGIC_SIGNATURES.PNG[2] &&
    buffer[3] === MAGIC_SIGNATURES.PNG[3] &&
    buffer[4] === MAGIC_SIGNATURES.PNG[4] &&
    buffer[5] === MAGIC_SIGNATURES.PNG[5] &&
    buffer[6] === MAGIC_SIGNATURES.PNG[6] &&
    buffer[7] === MAGIC_SIGNATURES.PNG[7]
  ) {
    return { isValid: true, detectedMime: 'image/png', safeExt: '.png' };
  }

  // 4. Check WEBP ("RIFF" .... "WEBP")
  if (
    buffer[0] === MAGIC_SIGNATURES.WEBP_RIFF[0] &&
    buffer[1] === MAGIC_SIGNATURES.WEBP_RIFF[1] &&
    buffer[2] === MAGIC_SIGNATURES.WEBP_RIFF[2] &&
    buffer[3] === MAGIC_SIGNATURES.WEBP_RIFF[3] &&
    buffer[8] === MAGIC_SIGNATURES.WEBP_HEADER[0] &&
    buffer[9] === MAGIC_SIGNATURES.WEBP_HEADER[1] &&
    buffer[10] === MAGIC_SIGNATURES.WEBP_HEADER[2] &&
    buffer[11] === MAGIC_SIGNATURES.WEBP_HEADER[3]
  ) {
    return { isValid: true, detectedMime: 'image/webp', safeExt: '.webp' };
  }

  return {
    isValid: false,
    detectedMime: null,
    safeExt: null,
    rejectionReason: 'توقيع الملف غير متطابق مع صيغ الصور المعتمدة (JPEG/PNG/WEBP)',
  };
}

/**
 * Strips dangerous EXIF / GPS metadata segments from JPEG buffers
 */
export function stripJpegExif(buffer: Buffer): Buffer {
  try {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;

    const cleanChunks: Buffer[] = [buffer.subarray(0, 2)]; // Keep SOI (FF D8)
    let offset = 2;

    while (offset < buffer.length - 4) {
      if (buffer[offset] !== 0xff) break;

      const marker = buffer[offset + 1];

      // End of Image (EOI) or Start of Scan (SOS) -> Copy remainder
      if (marker === 0xda || marker === 0xd9) {
        cleanChunks.push(buffer.subarray(offset));
        break;
      }

      const length = buffer.readUInt16BE(offset + 2);

      // APP1 Marker (0xFFE1) contains EXIF & GPS Location Data -> Skip it
      if (marker === 0xe1) {
        offset += 2 + length;
        continue;
      }

      // Keep safe segment
      cleanChunks.push(buffer.subarray(offset, offset + 2 + length));
      offset += 2 + length;
    }

    return Buffer.concat(cleanChunks);
  } catch {
    // If parsing fails, return original buffer safely
    return buffer;
  }
}
