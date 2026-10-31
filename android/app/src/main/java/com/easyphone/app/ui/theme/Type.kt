package com.easyphone.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/*
 * Tipografia: fonte do sistema (Roboto no Android), conforme o guia de identidade.
 *
 * Decisão de adaptação touch-first: os tamanhos do token (caption 11, body 13, control 14, heading 20,
 * keypad 24) são pixels lógicos de desktop. No Android usamos sp, que escala com a preferência de fonte
 * do usuário; por isso o corpo sobe para 14 sp e o teclado para 28 sp, mantendo a hierarquia do token.
 */
val EasyPhoneTypography = Typography(
    headlineMedium = TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Medium),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Medium),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.Normal),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Normal),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
)

/** Dígitos do teclado. tnum mantém a largura dos números estável ao digitar. */
val KeypadDigitStyle = TextStyle(
    fontSize = 28.sp,
    lineHeight = 32.sp,
    fontWeight = FontWeight.Medium,
    fontFeatureSettings = "tnum",
)
