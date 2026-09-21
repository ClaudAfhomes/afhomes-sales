import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'api_client.dart';

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

  Future<void> logout() async {
    await api.logout();
    if (mounted) setState(() => signedIn = false);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'AFhomes VIP',
      theme: ThemeData(
          colorSchemeSeed: const Color(0xff176b87), useMaterial3: true),
      home: loading
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : signedIn
              ? Home(api: api, onLogout: logout)
              : AuthScreen(
                  api: api,
                  onAuthenticated: () => setState(() => signedIn = true)));
}

class AuthScreen extends StatefulWidget {
  const AuthScreen(
      {super.key, required this.api, required this.onAuthenticated});
  final ApiClient api;
  final VoidCallback onAuthenticated;
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool register = false, busy = false;
  String? error, verificationEmail;
  final email = TextEditingController(),
      name = TextEditingController(),
      password = TextEditingController(),
      code = TextEditingController();
  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (verificationEmail != null) {
        await widget.api.verify(verificationEmail!, code.text);
        widget.onAuthenticated();
      } else if (register) {
        final result =
            await widget.api.register(email.text, name.text, password.text);
        setState(() => verificationEmail = email.text);
        if (result['development_code'] != null) {
          code.text = result['development_code'].toString();
        }
      } else {
        await widget.api.login(email.text, password.text);
        widget.onAuthenticated();
      }
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('AFhomes VIP')),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: ListView(
                  padding: const EdgeInsets.all(24),
                  shrinkWrap: true,
                  children: [
                    Text(
                        verificationEmail != null
                            ? 'Verify email'
                            : register
                                ? 'Create account'
                                : 'Welcome back',
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 16),
                    if (verificationEmail == null) ...[
                      TextField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          decoration:
                              const InputDecoration(labelText: 'Email')),
                      if (register)
                        TextField(
                            controller: name,
                            decoration:
                                const InputDecoration(labelText: 'Name')),
                      TextField(
                          controller: password,
                          obscureText: true,
                          decoration:
                              const InputDecoration(labelText: 'Password'))
                    ] else ...[
                      Text(
                          'Enter the verification code sent to $verificationEmail'),
                      TextField(
                          controller: code,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                              labelText: 'Verification code'))
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                        onPressed: busy ? null : submit,
                        child: Text(busy
                            ? 'Please wait…'
                            : verificationEmail != null
                                ? 'Verify'
                                : 'Continue')),
                    if (verificationEmail == null)
                      TextButton(
                          onPressed: () => setState(() => register = !register),
                          child: Text(register
                              ? 'Already registered? Sign in'
                              : 'Create customer account')),
                    if (error != null)
                      Text(error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error))
                  ]))));
}

class Home extends StatefulWidget {
  const Home({super.key, required this.api, required this.onLogout});
  final ApiClient api;
  final Future<void> Function() onLogout;
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  Map<String, dynamic>? data;
  List<dynamic> transactions = [], notifications = [], tickets = [];
  String? error;
  int tab = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final v = await Future.wait([
        widget.api.request('/api/v1/customer/me'),
        widget.api.request('/api/v1/customer/transactions'),
        widget.api.request('/api/v1/customer/notifications'),
        widget.api.request('/api/v1/support/tickets/mine')
      ]);
      if (mounted) {
        setState(() {
          data = v[0];
          transactions = v[1]['items'] ?? [];
          notifications = v[2]['items'] ?? [];
          tickets = v[3]['items'] ?? [];
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('AFhomes VIP'), actions: [
        IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout))
      ]),
      body: RefreshIndicator(
          onRefresh: load,
          child: data == null
              ? ListView(children: [
                  const SizedBox(height: 180),
                  Center(
                      child: error == null
                          ? const CircularProgressIndicator()
                          : Text(error!))
                ])
              : [
                  MembershipView(data: data!, api: widget.api, onChanged: load),
                  ActivityView(
                      transactions: transactions, notifications: notifications),
                  SupportView(
                      api: widget.api, tickets: tickets, onChanged: load)
                ][tab]),
      bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (v) => setState(() => tab = v),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.card_membership), label: 'VIP Card'),
            NavigationDestination(
                icon: Icon(Icons.receipt_long), label: 'Activity'),
            NavigationDestination(
                icon: Icon(Icons.support_agent), label: 'Support')
          ]));
}

class MembershipView extends StatelessWidget {
  const MembershipView(
      {super.key,
      required this.data,
      required this.api,
      required this.onChanged});
  final Map<String, dynamic> data;
  final ApiClient api;
  final Future<void> Function() onChanged;
  @override
  Widget build(BuildContext context) {
    final customer = data['customer'] as Map<String, dynamic>;
    final membership = data['membership'] as Map<String, dynamic>?;
    final card = data['card'] as Map<String, dynamic>?;
    return ListView(padding: const EdgeInsets.all(20), children: [
      Text('Hello, ${customer['display_name']}',
          style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 16),
      if (membership == null)
        Card(
            child: ListTile(
                title: const Text('Activate VIP'),
                subtitle:
                    const Text('Use a QR/NFC token, member code, or card ID.'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => showDialog(
                    context: context,
                    builder: (_) =>
                        ActivationDialog(api: api, onChanged: onChanged))))
      else
        Card(
            child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(children: [
                  Text('${membership['tier']} VIP',
                      style: Theme.of(context).textTheme.headlineSmall),
                  Text('${membership['available_points']} points',
                      style: Theme.of(context).textTheme.displaySmall),
                  Text('Status: ${membership['status']}'),
                  if (card != null) ...[
                    const SizedBox(height: 18),
                    QrImageView(
                        data: card['member_code'].toString(), size: 180),
                    Text(card['member_code'].toString()),
                    Text('Card ${card['card_public_id']}')
                  ]
                ])))
    ]);
  }
}

class ActivationDialog extends StatefulWidget {
  const ActivationDialog(
      {super.key, required this.api, required this.onChanged});
  final ApiClient api;
  final Future<void> Function() onChanged;
  @override
  State<ActivationDialog> createState() => _ActivationDialogState();
}

class _ActivationDialogState extends State<ActivationDialog> {
  final identifier = TextEditingController(), code = TextEditingController();
  String? error;
  Future<void> activateCard() async {
    try {
      await widget.api.request('/api/v1/cards/activate', method: 'POST', body: {
        'card_identifier': identifier.text,
        'activation_code': code.text
      });
      await widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: const Text('Activate VIP'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: identifier,
                decoration: const InputDecoration(
                    labelText: 'QR, NFC, member, or card code')),
            TextField(
                controller: code,
                decoration: const InputDecoration(
                    labelText: 'One-time activation code')),
            if (error != null)
              Text(error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error))
          ]),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(onPressed: activateCard, child: const Text('Activate'))
          ]);
}

class ActivityView extends StatelessWidget {
  const ActivityView(
      {super.key, required this.transactions, required this.notifications});
  final List<dynamic> transactions, notifications;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(20), children: [
        Text('Transactions', style: Theme.of(context).textTheme.headlineSmall),
        for (final item in transactions)
          ListTile(
              title: Text(
                  item['transaction_public_id']?.toString() ?? 'Transaction'),
              subtitle: Text(
                  '${item['currency_code']} ${item['amount_minor']} · ${item['status']}')),
        const Divider(),
        Text('Notifications', style: Theme.of(context).textTheme.headlineSmall),
        for (final item in notifications)
          ListTile(
              title: Text(item['title']?.toString() ?? 'Notification'),
              subtitle: Text(item['message']?.toString() ?? ''))
      ]);
}

class SupportView extends StatelessWidget {
  const SupportView(
      {super.key,
      required this.api,
      required this.tickets,
      required this.onChanged});
  final ApiClient api;
  final List<dynamic> tickets;
  final Future<void> Function() onChanged;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(20), children: [
        FilledButton.icon(
            onPressed: () => showDialog(
                context: context,
                builder: (_) => TicketDialog(api: api, onChanged: onChanged)),
            icon: const Icon(Icons.add),
            label: const Text('New support ticket')),
        for (final ticket in tickets)
          ListTile(
              title: Text(ticket['subject']?.toString() ?? 'Ticket'),
              subtitle: Text(ticket['status']?.toString() ?? ''),
              trailing: Text(ticket['priority']?.toString() ?? ''))
      ]);
}

class TicketDialog extends StatefulWidget {
  const TicketDialog({super.key, required this.api, required this.onChanged});
  final ApiClient api;
  final Future<void> Function() onChanged;
  @override
  State<TicketDialog> createState() => _TicketDialogState();
}

class _TicketDialogState extends State<TicketDialog> {
  final subject = TextEditingController(), message = TextEditingController();
  String? error;
  Future<void> submit() async {
    try {
      await widget.api.request('/api/v1/support/tickets',
          method: 'POST',
          body: {'subject': subject.text, 'message': message.text});
      await widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: const Text('Customer support'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: subject,
                decoration: const InputDecoration(labelText: 'Subject')),
            TextField(
                controller: message,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Message')),
            if (error != null) Text(error!)
          ]),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(onPressed: submit, child: const Text('Send'))
          ]);
}
