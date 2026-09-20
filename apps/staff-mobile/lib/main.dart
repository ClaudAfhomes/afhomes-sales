import 'package:flutter/material.dart';

const apiUrl=String.fromEnvironment('AFHOMES_API_URL',defaultValue:'http://10.0.2.2:3001');
void main()=>runApp(const App());

class App extends StatelessWidget{
 const App({super.key});
 @override Widget build(BuildContext context)=>MaterialApp(title:'AFhomes Staff',theme:ThemeData(colorSchemeSeed:const Color(0xff102a43),useMaterial3:true),home:const StaffHome());
}

class StaffHome extends StatelessWidget{
 const StaffHome({super.key});
 static const actions=['Scan printed QR','Read NFC','Enter member code','Create transaction','Redeem points','Customer lookup'];
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('AFhomes Staff POS')),
  body:ListView(padding:const EdgeInsets.all(20),children:[
   for(final action in actions)Card(child:ListTile(title:Text(action),trailing:const Icon(Icons.chevron_right))),
   const Text('API: $apiUrl',textAlign:TextAlign.center),
  ]),
 );
}
