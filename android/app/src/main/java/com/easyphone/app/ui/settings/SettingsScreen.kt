package com.easyphone.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.ColumnScope
import com.easyphone.app.R
import com.easyphone.app.ui.components.ScreenHeader
import com.easyphone.app.ui.components.UnavailableBanner

/** Versão exibida na tela Sobre. Manter igual a versionName em app/build.gradle.kts. */
private const val APP_VERSION = "0.1.0"

/**
 * Configurações. Cada seção mostra o estado real: sem conta, sem dispositivo de áudio e com telefonia
 * indisponível. Adicionar conta fica desabilitado até existir o mecanismo SIP.
 */
@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        ScreenHeader(title = stringResource(R.string.settings_title))

        SettingsSection(title = stringResource(R.string.settings_section_telephony)) {
            UnavailableBanner(
                title = stringResource(R.string.telephony_unavailable_title),
                body = stringResource(R.string.telephony_unavailable_body),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        SettingsSection(title = stringResource(R.string.settings_section_account)) {
            Text(
                text = stringResource(R.string.settings_account_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = {}, enabled = false) {
                Text(stringResource(R.string.settings_account_add))
            }
        }

        SettingsSection(title = stringResource(R.string.settings_section_audio)) {
            Text(
                text = stringResource(R.string.settings_audio_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        SettingsSection(title = stringResource(R.string.settings_section_about)) {
            Text(
                text = stringResource(R.string.settings_version, APP_VERSION),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceContainer,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(16.dp), content = content)
        }
    }
}
