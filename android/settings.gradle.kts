// Projeto Android nativo do easyphone (Kotlin + Jetpack Compose).
// Estrutura espelha o repositório: phone-desktop/ continua sendo o desktop Electron/wx e não é alterado aqui.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Decisão: repositórios centralizados aqui; módulos não declaram repositórios próprios.
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "easyphone"
include(":app")
