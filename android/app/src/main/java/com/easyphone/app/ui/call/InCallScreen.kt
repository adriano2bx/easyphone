package com.easyphone.app.ui.call

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easyphone.app.R
import com.easyphone.app.sip.CallDirection
import com.easyphone.app.sip.CallState
import com.easyphone.app.sip.PhoneCall
import com.easyphone.app.ui.theme.EasyPhoneBrand
import com.easyphone.app.ui.theme.EasyPhoneDanger

/**
 * Tela de chamada: exibe o estado real vindo do repositório.
 *
 * Decisão: a chamada recebida (Ringing + Incoming) mostra Atender e Recusar; nas demais situações mostra
 * Mudo, Espera e Encerrar. Os controles não mudam o estado localmente: a UI só mostra o que o mecanismo
 * SIP confirmar (o callback chama o repositório e o próximo estado chega pelo Flow).
 */
@Composable
fun InCallScreen(
    call: PhoneCall,
    onAnswer: () -> Unit,
    onReject: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleHold: () -> Unit,
    onHangup: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val incomingRinging = call.state == CallState.Ringing && call.direction == CallDirection.Incoming

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth().padding(top = 48.dp),
        ) {
            Text(
                text = call.displayName ?: call.remoteUri.ifBlank {
                    stringResource(R.string.call_unknown_party)
                },
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stateLabel(call.state),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (incomingRinging) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(
                    onClick = onAnswer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.height(56.dp).width(140.dp),
                ) {
                    Icon(Icons.Filled.Call, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.call_action_answer), style = MaterialTheme.typography.labelLarge)
                }
                Button(
                    onClick = onReject,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = EasyPhoneDanger,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.height(56.dp).width(140.dp),
                ) {
                    Icon(Icons.Filled.CallEnd, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.call_action_reject), style = MaterialTheme.typography.labelLarge)
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                CallControl(
                    icon = if (call.muted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    label = stringResource(
                        if (call.muted) R.string.call_action_unmute else R.string.call_action_mute,
                    ),
                    selected = call.muted,
                    onClick = onToggleMute,
                )
                CallControl(
                    icon = if (call.held) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                    label = stringResource(
                        if (call.held) R.string.call_action_resume else R.string.call_action_hold,
                    ),
                    selected = call.held,
                    onClick = onToggleHold,
                )
            }
        }

        if (!incomingRinging) {
            Button(
                onClick = onHangup,
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = EasyPhoneDanger,
                    contentColor = Color.White,
                ),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Icon(Icons.Filled.CallEnd, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.call_action_hangup), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun CallControl(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            modifier = Modifier
                .size(64.dp)
                .toggleable(value = selected, role = Role.Switch, onValueChange = { onClick() }),
            shape = CircleShape,
            color = if (selected) EasyPhoneBrand else MaterialTheme.colorScheme.surfaceContainerHigh,
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun stateLabel(state: CallState): String = stringResource(
    when (state) {
        CallState.Ringing -> R.string.call_state_ringing
        CallState.Connecting -> R.string.call_state_connecting
        CallState.EarlyMedia -> R.string.call_state_early_media
        CallState.Active -> R.string.call_state_active
        CallState.Held -> R.string.call_state_held
        CallState.Ending -> R.string.call_state_ending
        CallState.Ended -> R.string.call_state_ended
        CallState.Failed -> R.string.call_state_failed
    },
)
