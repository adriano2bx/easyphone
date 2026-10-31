package com.easyphone.app

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.easyphone.app.sip.SipFailure
import com.easyphone.app.sip.SipRepository
import com.easyphone.app.sip.SipResult
import com.easyphone.app.ui.call.InCallScreen
import com.easyphone.app.ui.contacts.ContactsScreen
import com.easyphone.app.ui.dialer.DialerScreen
import com.easyphone.app.ui.recents.RecentsScreen
import com.easyphone.app.ui.settings.SettingsScreen
import kotlinx.coroutines.launch

/** Destinos da navegação inferior. Ordem = ordem visual, da esquerda para a direita. */
enum class Destination(@param:StringRes val label: Int) {
    Dialer(R.string.nav_dialer),
    Contacts(R.string.nav_contacts),
    Recents(R.string.nav_recents),
    Settings(R.string.nav_settings),
}

/**
 * Raiz da UI.
 *
 * Decisões:
 * - Sem biblioteca de navegação: são quatro destinos planos e um estado de chamada. Navigation-Compose
 *   entra quando houver telas de detalhe (ex.: edição de conta).
 * - Chamada ativa substitui a navegação inferior (tela cheia), como em apps de telefonia nativos.
 * - Falhas de ação aparecem em Snackbar com o motivo devolvido pelo repositório.
 */
@Composable
fun EasyPhoneApp(sip: SipRepository, modifier: Modifier = Modifier) {
    val call by sip.activeCall.collectAsStateWithLifecycle()
    var destination by rememberSaveable { mutableStateOf(Destination.Dialer) }
    var number by rememberSaveable { mutableStateOf("") }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val unavailableMessage = stringResource(R.string.error_sip_unavailable)

    val reportFailure: suspend (SipResult) -> Unit = { result ->
        if (result is SipResult.Failed) {
            val message = when (val failure = result.failure) {
                SipFailure.Unavailable -> unavailableMessage
                is SipFailure.Rejected -> failure.reason
            }
            snackbar.showSnackbar(message)
        }
    }

    val current = call
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (current == null) {
                EasyPhoneNavigationBar(selected = destination, onSelect = { destination = it })
            }
        },
    ) { innerPadding ->
        val contentModifier = Modifier.padding(innerPadding)
        if (current != null) {
            InCallScreen(
                call = current,
                onAnswer = { scope.launch { reportFailure(sip.answer(current.id)) } },
                onReject = { scope.launch { reportFailure(sip.reject(current.id)) } },
                onToggleMute = { scope.launch { reportFailure(sip.setMuted(current.id, !current.muted)) } },
                onToggleHold = { scope.launch { reportFailure(sip.setHeld(current.id, !current.held)) } },
                onHangup = { scope.launch { reportFailure(sip.hangup(current.id)) } },
                modifier = contentModifier,
            )
        } else {
            when (destination) {
                Destination.Dialer -> DialerScreen(
                    number = number,
                    onNumberChange = { number = it },
                    telephonyAvailable = sip.isAvailable,
                    onCall = { scope.launch { reportFailure(sip.dial(number)) } },
                    modifier = contentModifier,
                )
                Destination.Contacts -> ContactsScreen(modifier = contentModifier)
                Destination.Recents -> RecentsScreen(modifier = contentModifier)
                Destination.Settings -> SettingsScreen(modifier = contentModifier)
            }
        }
    }
}

@Composable
private fun EasyPhoneNavigationBar(selected: Destination, onSelect: (Destination) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Destination.entries.forEach { item ->
            NavigationBarItem(
                selected = item == selected,
                onClick = { onSelect(item) },
                icon = { Icon(imageVector = item.icon(), contentDescription = null) },
                label = { Text(stringResource(item.label)) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

/** Ícone de cada destino. Mantido fora do enum para não acoplar o modelo de navegação ao Compose. */
private fun Destination.icon() = when (this) {
    Destination.Dialer -> Icons.Filled.Dialpad
    Destination.Contacts -> Icons.Filled.Contacts
    Destination.Recents -> Icons.Filled.History
    Destination.Settings -> Icons.Filled.Settings
}
