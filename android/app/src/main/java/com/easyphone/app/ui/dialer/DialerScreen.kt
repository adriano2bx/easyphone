package com.easyphone.app.ui.dialer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easyphone.app.R
import com.easyphone.app.dial.canDial
import com.easyphone.app.dial.sanitizeDialInput
import com.easyphone.app.ui.components.UnavailableBanner
import com.easyphone.app.ui.theme.KeypadDigitStyle

/** Teclado 3 x 4 padrão de telefone. */
private val keypadRows = listOf(
    listOf("1", "2", "3"),
    listOf("4", "5", "6"),
    listOf("7", "8", "9"),
    listOf("*", "0", "#"),
)

/*
 * Decisão touch-first: teclas de 72dp (acima do alvo mínimo de 48dp e do token keypad de 50px,
 * que é pensado para mouse). Espaço entre teclas de 20dp para evitar toques acidentais.
 */
private val KeySize = 72.dp

/**
 * Tela do discador. O botão Ligar fica desabilitado enquanto [telephonyAvailable] for false,
 * e o aviso explica o motivo em texto.
 */
@Composable
fun DialerScreen(
    number: String,
    onNumberChange: (String) -> Unit,
    telephonyAvailable: Boolean,
    onCall: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (!telephonyAvailable) {
            UnavailableBanner(
                title = stringResource(R.string.telephony_unavailable_title),
                body = stringResource(R.string.telephony_unavailable_body),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
        }

        Row(
            modifier = Modifier.fillMaxWidth().height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = number.ifEmpty { stringResource(R.string.dialer_placeholder) },
                style = MaterialTheme.typography.headlineMedium,
                color = if (number.isEmpty()) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onBackground
                },
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = { onNumberChange(number.dropLast(1)) },
                enabled = number.isNotEmpty(),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Backspace,
                    contentDescription = stringResource(R.string.dialer_backspace),
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        keypadRows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.padding(vertical = 6.dp),
            ) {
                row.forEach { key ->
                    DialKey(label = key) { onNumberChange(sanitizeDialInput(number + key)) }
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onCall,
            enabled = canDial(number, telephonyAvailable),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Call,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.dialer_call),
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
private fun DialKey(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.size(KeySize),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize(),
        ) {
            Text(
                text = label,
                style = KeypadDigitStyle,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
