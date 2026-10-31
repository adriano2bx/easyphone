// Plugins declarados sem aplicar no raiz; cada módulo aplica o que usa.
// Decisão: AGP 9 já traz Kotlin embutido (built-in Kotlin). Por isso NÃO há
// o plugin org.jetbrains.kotlin.android; apenas o plugin do compilador Compose.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
