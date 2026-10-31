package com.easyphone.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/*
 * Esquema escuro fixo. Decisão: nenhum esquema claro e nenhuma cor dinâmica do sistema, para
 * preservar a identidade. Papéis não usados pelo app (tertiary, secondary) recebem tons neutros
 * para não aparecerem com o roxo padrão do Material. O tema ignora o modo claro/escuro do sistema.
 */
private val EasyPhoneColorScheme = darkColorScheme(
    primary = EasyPhoneBrand,
    onPrimary = EasyPhoneOnBrand,
    primaryContainer = EasyPhoneControl,
    onPrimaryContainer = EasyPhoneTextPrimary,
    secondary = EasyPhoneTextMuted,
    onSecondary = EasyPhoneGraphite,
    secondaryContainer = EasyPhoneControl,
    onSecondaryContainer = EasyPhoneTextPrimary,
    tertiary = EasyPhoneTextMuted,
    onTertiary = EasyPhoneGraphite,
    background = EasyPhoneGraphite,
    onBackground = EasyPhoneTextPrimary,
    surface = EasyPhonePanel,
    onSurface = EasyPhoneTextPrimary,
    surfaceVariant = EasyPhoneControl,
    onSurfaceVariant = EasyPhoneTextMuted,
    surfaceContainerLowest = EasyPhoneSidebar,
    surfaceContainerLow = EasyPhoneSidebar,
    surfaceContainer = EasyPhonePanel,
    surfaceContainerHigh = EasyPhoneControl,
    surfaceContainerHighest = EasyPhoneDivider,
    outline = EasyPhoneDivider,
    outlineVariant = EasyPhoneDivider,
    error = EasyPhoneDanger,
    onError = EasyPhoneTextPrimary,
)

@Composable
fun EasyPhoneTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = EasyPhoneColorScheme,
        typography = EasyPhoneTypography,
        content = content,
    )
}
