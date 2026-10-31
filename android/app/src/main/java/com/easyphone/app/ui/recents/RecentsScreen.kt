package com.easyphone.app.ui.recents

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.easyphone.app.R
import com.easyphone.app.ui.components.EmptyState
import com.easyphone.app.ui.components.ScreenHeader

/**
 * Recentes. Não há histórico persistido nesta versão, então exibe o estado vazio honesto.
 * Quando o histórico existir, a lista entra aqui (linhas compactas, Hoje/Ontem, filtro Todas/Perdidas).
 */
@Composable
fun RecentsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        ScreenHeader(title = stringResource(R.string.recents_title))
        EmptyState(
            icon = Icons.Filled.History,
            title = stringResource(R.string.recents_empty_title),
            body = stringResource(R.string.recents_empty_body),
            modifier = Modifier.weight(1f),
        )
    }
}
