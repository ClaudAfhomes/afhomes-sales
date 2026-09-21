import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:nfc_manager/nfc_manager.dart';
import 'package:nfc_manager_ndef/nfc_manager_ndef.dart';
import 'api_client.dart';

const enableNfcSimulator =
    bool.fromEnvironment('ENABLE_NFC_SIMULATOR', defaultValue: false);
void main() => runApp(const App());

class App extends StatefulWidget {
  const App({super.key});
  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  final api = ApiClient();
  bool loading = true, signedIn = false;
  @override
  void initState() {
    super.initState();
    api.restore().then((v) {
      if (mounted) {
        setState(() {
          signedIn = v;
          loading = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'AFhomes Staff POS',
      theme: ThemeData(
          colorSchemeSeed: const Color(0xff102a43), useMaterial3: true),
      home: loading
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : signedIn
              ? StaffHome(
                  api: api,
                  onLogout: () async {
                    await api.logout();
                    if (mounted) setState(() => signedIn = false);
                  })
              : LoginScreen(
                  api: api, onLogin: () => setState(() => signedIn = true)));
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLogin});
  final ApiClient api;
  final VoidCallback onLogin;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(), password = TextEditingController();
  String? error;
  bool busy = false;
  Future<void> login() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.login(email.text, password.text);
      widget.onLogin();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('AFhomes Staff POS')),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: ListView(
                  padding: const EdgeInsets.all(24),
                  shrinkWrap: true,
                  children: [
                    Text('Employee sign in',
                        style: Theme.of(context).textTheme.headlineMedium),
                    TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Email')),
                    TextField(
                        controller: password,
                        obscureText: true,
                        decoration:
                            const InputDecoration(labelText: 'Password')),
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: busy ? null : login,
                        child: Text(busy ? 'Signing in…' : 'Sign in')),
                    if (error != null)
                      Text(error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error))
                  ]))));
}

class StaffHome extends StatefulWidget {
  const StaffHome({super.key, required this.api, required this.onLogout});
  final ApiClient api;
  final Future<void> Function() onLogout;
  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {
  Map<String, dynamic>? member;
  String? error;
  bool busy = false;
  final identifier = TextEditingController();
  Future<void> lookup(String method, String value) async {
    setState(() {
      busy = true;
      error = null;
      member = null;
    });
    try {
      final found = await widget.api.request('/api/v1/members/lookup',
          method: 'POST', body: {'method': method, 'value': value.trim()});
      if (mounted) setState(() => member = found);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> scanQr() async {
    final value = await Navigator.push<String>(
        context, MaterialPageRoute(builder: (_) => const ScannerScreen()));
    if (value != null) await lookup('printed_qr_token', value);
  }

  Future<void> scanNfc() async {
    final availability = await NfcManager.instance.checkAvailability();
    if (availability != NfcAvailability.enabled) {
      setState(() => error = 'NFC is unavailable or disabled.');
      return;
    }
    await NfcManager.instance.startSession(
        pollingOptions: {NfcPollingOption.iso14443, NfcPollingOption.iso15693},
        onDiscovered: (tag) async {
          final ndef = Ndef.from(tag);
          final message = ndef?.cachedMessage ?? await ndef?.read();
          final payload = message?.records.isNotEmpty == true
              ? message!.records.first.payload
              : null;
          await NfcManager.instance.stopSession();
          if (payload == null || payload.isEmpty) {
            if (mounted) {
              setState(() => error = 'The NFC tag has no NDEF token.');
            }
            return;
          }
          var value = utf8
              .decode(payload, allowMalformed: true)
              .replaceAll(RegExp(r'[^\x20-\x7E]'), '')
              .trim();
          if (value.startsWith('en')) value = value.substring(2);
          if (mounted) await lookup('nfc_token', value);
        });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('AFhomes Staff POS'), actions: [
        IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout))
      ]),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Text('Identify member',
            style: Theme.of(context).textTheme.headlineMedium),
        Wrap(spacing: 8, children: [
          FilledButton.icon(
              onPressed: busy ? null : scanQr,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan printed QR')),
          FilledButton.icon(
              onPressed: busy ? null : scanNfc,
              icon: const Icon(Icons.nfc),
              label: const Text('Read NFC'))
        ]),
        TextField(
            controller: identifier,
            decoration: const InputDecoration(labelText: 'Member code')),
        FilledButton(
            onPressed:
                busy ? null : () => lookup('member_code', identifier.text),
            child: const Text('Enter member code')),
        if (enableNfcSimulator && kDebugMode)
          TextButton(
              onPressed: () => lookup('nfc_token', identifier.text),
              child: const Text('Development NFC simulator')),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        if (member != null)
          MemberCard(
              api: widget.api,
              member: member!,
              onUpdated: (m) => setState(() => member = m))
      ]));
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});
  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  bool returned = false;
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Scan member QR')),
      body: MobileScanner(onDetect: (capture) {
        if (returned) return;
        final value = capture.barcodes.firstOrNull?.rawValue;
        if (value != null) {
          returned = true;
          Navigator.pop(context, value);
        }
      }));
}

class MemberCard extends StatelessWidget {
  const MemberCard(
      {super.key,
      required this.api,
      required this.member,
      required this.onUpdated});
  final ApiClient api;
  final Map<String, dynamic> member;
  final ValueChanged<Map<String, dynamic>> onUpdated;
  @override
  Widget build(BuildContext context) {
    final customer = member['customer'],
        membership = member['membership'],
        card = member['card'];
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(20),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(customer['display_name'] ?? 'Customer',
                  style: Theme.of(context).textTheme.headlineSmall),
              Text(customer['email'] ?? ''),
              Text('${membership['tier']} · ${membership['status']}'),
              Text('${membership['available_points']} available points'),
              Text('Card: ${card['status']}'),
              const SizedBox(height: 12),
              FilledButton.icon(
                  onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => TransactionScreen(
                              api: api,
                              member: member,
                              onCommitted: onUpdated))),
                  icon: const Icon(Icons.point_of_sale),
                  label: const Text('Create transaction'))
            ])));
  }
}

class TransactionScreen extends StatefulWidget {
  const TransactionScreen(
      {super.key,
      required this.api,
      required this.member,
      required this.onCommitted});
  final ApiClient api;
  final Map<String, dynamic> member;
  final ValueChanged<Map<String, dynamic>> onCommitted;
  @override
  State<TransactionScreen> createState() => _TransactionScreenState();
}

class _TransactionScreenState extends State<TransactionScreen> {
  final items = <LineItem>[LineItem()];
  final points = TextEditingController(text: '0');
  String? result;
  bool busy = false;
  Future<void> commit() async {
    setState(() {
      busy = true;
      result = null;
    });
    try {
      final membership = widget.member['membership'],
          card = widget.member['card'];
      final response = await widget.api
          .request('/api/v1/transactions', method: 'POST', body: {
        'idempotency_key': DateTime.now().microsecondsSinceEpoch.toString(),
        'branch_id': 'BR-PH-0001',
        'membership_id': membership['membership_public_id'],
        'card_lookup_method': 'card_public_id',
        'card_identifier': card['card_public_id'],
        'type': 'SALE',
        'currency_code': 'PHP',
        'points_redeemed': int.tryParse(points.text) ?? 0,
        'items': items.map((i) => i.json).toList()
      });
      setState(() => result =
          'Committed ${response['transaction_public_id']} · balance ${response['balance']}');
      final updated = Map<String, dynamic>.from(widget.member);
      updated['membership'] = {
        ...Map<String, dynamic>.from(membership),
        'available_points': response['balance']
      };
      widget.onCommitted(updated);
    } catch (e) {
      setState(() => result = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('New transaction')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        for (var index = 0; index < items.length; index++)
          ItemEditor(item: items[index], index: index),
        OutlinedButton.icon(
            onPressed: () => setState(() => items.add(LineItem())),
            icon: const Icon(Icons.add),
            label: const Text('Add item')),
        TextField(
            controller: points,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Points to redeem')),
        FilledButton(
            onPressed: busy ? null : commit,
            child: Text(busy ? 'Committing…' : 'Commit transaction')),
        if (result != null) Text(result!)
      ]));
}

class LineItem {
  final code = TextEditingController(),
      description = TextEditingController(),
      quantity = TextEditingController(text: '1'),
      amount = TextEditingController();
  Map<String, dynamic> get json => {
        'product_code': code.text,
        'description': description.text,
        'quantity': int.tryParse(quantity.text) ?? 1,
        'unit_amount_minor': int.tryParse(amount.text) ?? 0
      };
}

class ItemEditor extends StatelessWidget {
  const ItemEditor({super.key, required this.item, required this.index});
  final LineItem item;
  final int index;
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Text('Item ${index + 1}'),
            TextField(
                controller: item.code,
                decoration: const InputDecoration(labelText: 'Product code')),
            TextField(
                controller: item.description,
                decoration: const InputDecoration(labelText: 'Description')),
            Row(children: [
              Expanded(
                  child: TextField(
                      controller: item.quantity,
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Quantity'))),
              const SizedBox(width: 12),
              Expanded(
                  child: TextField(
                      controller: item.amount,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                          labelText: 'Amount (minor units)')))
            ])
          ])));
}
